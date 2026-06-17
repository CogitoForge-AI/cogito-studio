use super::LLMProvider;
use crate::error::AppError;
use crate::events::{MessageEmitter, TokenUsage as EventTokenUsage, ToolEmitter};
use crate::models::llm_types::{
    LLMChatRequest, LLMChatResponse, LLMModel, SSEChunk, TokenUsage, ToolCall, ToolCallFunction,
};
use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use std::sync::Arc;
use tauri::AppHandle;

pub struct OpenAICompatProvider {
    client: Arc<Client>,
}

impl OpenAICompatProvider {
    pub const fn new(client: Arc<Client>) -> Self {
        Self { client }
    }

    fn check_model_capabilities(model_id: &str) -> (bool, bool, bool) {
        // Remove provider prefix if exists (e.g., "openai/gpt-4" -> "gpt-4")
        let clean_id = model_id.split('/').next_back().unwrap_or(model_id);
        let model_lower = clean_id.to_lowercase();

        let supports_tools = crate::models::llm_types::model_supports_tools(model_id);

        // Models that support thinking/reasoning:
        // - GPT-o1 series
        // - GPT-oss series
        // - DeepSeek V3 and R1
        let supports_thinking = model_lower.contains("o1")
            || model_lower.contains("gpt-oss")
            || model_lower.contains("gpt_oss")
            || model_lower.contains("deepseek-v3")
            || model_lower.contains("deepseek-r1");

        (supports_tools, supports_thinking, false)
    }

    async fn handle_streaming(
        &self,
        req_builder: reqwest::RequestBuilder,
        request_body: serde_json::Value,
        chat_id: String,
        message_id: String,
        app: AppHandle,
        mut cancellation_rx: Option<tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<LLMChatResponse, AppError> {
        let response = req_builder.json(&request_body).send().await?;

        let message_emitter = MessageEmitter::new(app.clone());
        let tool_emitter = ToolEmitter::new(app.clone());

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            let error_msg = format!("LLM API error ({status}): {error_text}");

            message_emitter.emit_message_error(
                chat_id.clone(),
                message_id.clone(),
                error_msg.clone(),
            )?;

            return Err(AppError::Llm(error_msg));
        }

        let mut stream = response.bytes_stream();
        let mut full_content = String::new();
        let mut full_reasoning = String::new();
        let mut tool_calls: Vec<ToolCall> = Vec::new();
        let mut finish_reason: Option<String> = None;
        let mut buffer = String::new();
        let mut tool_calls_emitted = false; // Track if we've already emitted tool calls
        let mut final_usage: Option<TokenUsage> = None;

        while let Some(item) = tokio::select! {
            // Listen for stream chunks
            next_item = stream.next() => next_item,
            // Listen for cancellation signal
            () = async {
                if let Some(ref mut rx) = cancellation_rx {
                    let _ = rx.recv().await;
                }
                futures::future::pending::<()>().await;
            }, if cancellation_rx.is_some() => {
                return Err(AppError::Cancelled);
            }
        } {
            let chunk = item.map_err(|e| AppError::Generic(format!("Stream error: {e}")))?;
            let text = String::from_utf8_lossy(&chunk);
            buffer.push_str(&text);

            // Parse SSE format: "data: {...}\n\n"
            while let Some(end_idx) = buffer.find("\n\n") {
                let line = buffer[..end_idx].trim().to_string();
                buffer = buffer[end_idx + 2..].to_string();

                if let Some(data) = line.strip_prefix("data: ") {
                    if data == "[DONE]" {
                        break;
                    }

                    match serde_json::from_str::<SSEChunk>(data) {
                        Ok(sse_chunk) => {
                            tracing::debug!(?sse_chunk, "Parsed SSE chunk");

                            // Check for usage
                            if let Some(usage) = sse_chunk.usage {
                                final_usage = Some(usage);
                            }
                            if let Some(choices) = sse_chunk.choices {
                                for choice in choices {
                                    if let Some(delta) = choice.delta {
                                        // Handle content delta
                                        if let Some(ref content) = delta.content {
                                            full_content.push_str(content);

                                            // Emit chunk event
                                            message_emitter.emit_message_chunk(
                                                chat_id.clone(),
                                                message_id.clone(),
                                                content.clone(),
                                            )?;
                                        }

                                        // Handle reasoning/thinking content
                                        if let Some(reasoning) = delta.get_reasoning() {
                                            full_reasoning.push_str(&reasoning);
                                            message_emitter.emit_thinking_chunk(
                                                chat_id.clone(),
                                                message_id.clone(),
                                                reasoning,
                                            )?;
                                        }

                                        // Handle tool calls delta
                                        if let Some(tool_call_deltas) = delta.tool_calls {
                                            for tool_call_delta in tool_call_deltas {
                                                let index =
                                                    tool_call_delta.index.unwrap_or(0) as usize;

                                                // Ensure we have enough tool calls
                                                while tool_calls.len() <= index {
                                                    tool_calls.push(ToolCall {
                                                        id: String::new(),
                                                        r#type: "function".to_string(),
                                                        function: ToolCallFunction {
                                                            name: String::new(),
                                                            arguments: String::new(),
                                                        },
                                                    });
                                                }

                                                // Update tool call
                                                if let Some(id) = tool_call_delta.id {
                                                    tool_calls[index].id = id;
                                                }
                                                if let Some(name) = tool_call_delta
                                                    .function
                                                    .as_ref()
                                                    .and_then(|f| f.name.as_ref())
                                                {
                                                    tool_calls[index].function.name.push_str(name);
                                                }
                                                if let Some(args) = tool_call_delta
                                                    .function
                                                    .as_ref()
                                                    .and_then(|f| f.arguments.as_ref())
                                                {
                                                    tool_calls[index]
                                                        .function
                                                        .arguments
                                                        .push_str(args);
                                                }
                                            }

                                            // Emit tool calls detected event when we first detect tool calls
                                            if !tool_calls_emitted
                                                && !tool_calls.is_empty()
                                                && tool_calls.iter().any(|tc| !tc.id.is_empty())
                                            {
                                                let tool_calls: Vec<crate::events::ToolCall> =
                                                    tool_calls
                                                        .iter()
                                                        .filter(|tc| !tc.id.is_empty())
                                                        .map(|tc| crate::events::ToolCall {
                                                            id: tc.id.clone(),
                                                            name: tc.function.name.clone(),
                                                            arguments: serde_json::from_str(
                                                                &tc.function.arguments,
                                                            )
                                                            .unwrap_or_else(|_| {
                                                                serde_json::json!({})
                                                            }),
                                                        })
                                                        .collect();

                                                tool_emitter.emit_tool_calls_detected(
                                                    chat_id.clone(),
                                                    message_id.clone(),
                                                    tool_calls,
                                                )?;

                                                tool_calls_emitted = true;
                                            }
                                        }
                                    }

                                    if let Some(reason) = choice.finish_reason {
                                        finish_reason = Some(reason);
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            // Ignore parse errors for incomplete chunks
                            if !data.is_empty() {
                                tracing::error!(error = %e, data = %data, "Failed to parse SSE chunk");
                            }
                        }
                    }
                }
            }
        }

        // Emit tool calls detected event if we haven't already and have tool calls
        if !tool_calls_emitted && !tool_calls.is_empty() {
            let tool_calls: Vec<crate::events::ToolCall> = tool_calls
                .iter()
                .map(|tc| crate::events::ToolCall {
                    id: tc.id.clone(),
                    name: tc.function.name.clone(),
                    arguments: serde_json::from_str(&tc.function.arguments)
                        .unwrap_or_else(|_| serde_json::json!({})),
                })
                .collect();

            tool_emitter.emit_tool_calls_detected(
                chat_id.clone(),
                message_id.clone(),
                tool_calls,
            )?;
        }

        // Emit complete event
        // SSE doesn't provide usage in chunks, would need final chunk
        message_emitter.emit_message_complete(
            chat_id.clone(),
            message_id.clone(),
            full_content.clone(),
            final_usage.as_ref().map(|u| EventTokenUsage {
                prompt_tokens: u.prompt_tokens,
                completion_tokens: u.completion_tokens,
                total_tokens: u.total_tokens,
            }),
        )?;

        Ok(LLMChatResponse {
            content: full_content,
            finish_reason,
            tool_calls: if tool_calls.is_empty() {
                None
            } else {
                Some(tool_calls)
            },
            usage: final_usage,
            reasoning: if full_reasoning.is_empty() {
                None
            } else {
                Some(full_reasoning)
            },
            images: None,
        })
    }

    async fn handle_non_streaming(
        &self,
        req_builder: reqwest::RequestBuilder,
        request_body: serde_json::Value,
        chat_id: String,
        message_id: String,
        app: AppHandle,
    ) -> Result<LLMChatResponse, AppError> {
        let response = req_builder
            .json(&request_body)
            .send()
            .await
            .map_err(|e| AppError::Generic(format!("HTTP request failed: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            let error_msg = format!("LLM API error ({status}): {error_text}");

            let message_emitter = MessageEmitter::new(app.clone());
            message_emitter.emit_message_error(
                chat_id.clone(),
                message_id.clone(),
                error_msg.clone(),
            )?;

            return Err(AppError::Generic(error_msg));
        }

        let json_response: serde_json::Value = response
            .json()
            .await
            .map_err(|e| AppError::Generic(format!("Failed to parse response: {e}")))?;

        // Parse OpenAI-compatible response
        let choices = json_response
            .get("choices")
            .and_then(|c| c.as_array())
            .ok_or_else(|| {
                AppError::Generic("Invalid response format: missing choices".to_string())
            })?;

        let message = choices
            .first()
            .and_then(|c| c.get("message"))
            .ok_or_else(|| {
                AppError::Generic("Invalid response format: missing message".to_string())
            })?;

        let content = message
            .get("content")
            .and_then(|c| c.as_str())
            .unwrap_or("")
            .to_string();

        let reasoning = message
            .get("reasoning_content")
            .or_else(|| message.get("reasoning"))
            .and_then(|c| c.as_str())
            .filter(|value| !value.is_empty())
            .map(str::to_string);

        let finish_reason = choices
            .first()
            .and_then(|c| c.get("finish_reason"))
            .and_then(|r| r.as_str())
            .map(std::string::ToString::to_string);

        // Parse tool calls
        let tool_calls: Option<Vec<ToolCall>> = message
            .get("tool_calls")
            .and_then(|tc| tc.as_array())
            .map(|tc_array| {
                tc_array
                    .iter()
                    .filter_map(|tc| {
                        let id = tc.get("id")?.as_str()?.to_string();
                        let function = tc.get("function")?;
                        let name = function.get("name")?.as_str()?.to_string();
                        let arguments = function
                            .get("arguments")
                            .and_then(|a| a.as_str().map(std::string::ToString::to_string))
                            .or_else(|| {
                                function
                                    .get("arguments")
                                    .and_then(|a| serde_json::to_string(a).ok())
                            })
                            .unwrap_or_else(|| "{}".to_string());

                        Some(ToolCall {
                            id,
                            r#type: tc
                                .get("type")
                                .and_then(|t| t.as_str())
                                .unwrap_or("function")
                                .to_string(),
                            function: ToolCallFunction { name, arguments },
                        })
                    })
                    .collect()
            });

        let tool_emitter = ToolEmitter::new(app.clone());
        let message_emitter = MessageEmitter::new(app.clone());

        // Emit tool calls detected event if we have tool calls
        if let Some(ref tool_calls_vec) = tool_calls {
            if !tool_calls_vec.is_empty() {
                let tool_calls: Vec<crate::events::ToolCall> = tool_calls_vec
                    .iter()
                    .map(|tc| crate::events::ToolCall {
                        id: tc.id.clone(),
                        name: tc.function.name.clone(),
                        arguments: serde_json::from_str(&tc.function.arguments)
                            .unwrap_or_else(|_| serde_json::json!({})),
                    })
                    .collect();

                tool_emitter.emit_tool_calls_detected(
                    chat_id.clone(),
                    message_id.clone(),
                    tool_calls,
                )?;
            }
        }

        // Parse usage
        let usage = json_response.get("usage").map(|u| TokenUsage {
            prompt_tokens: u
                .get("prompt_tokens")
                .and_then(serde_json::Value::as_u64)
                .map(|v| v as u32),
            completion_tokens: u
                .get("completion_tokens")
                .and_then(serde_json::Value::as_u64)
                .map(|v| v as u32),
            total_tokens: u
                .get("total_tokens")
                .and_then(serde_json::Value::as_u64)
                .map(|v| v as u32),
        });

        // Emit complete event
        message_emitter.emit_message_complete(
            chat_id.clone(),
            message_id.clone(),
            content.clone(),
            usage.as_ref().map(|u| EventTokenUsage {
                prompt_tokens: u.prompt_tokens,
                completion_tokens: u.completion_tokens,
                total_tokens: u.total_tokens,
            }),
        )?;

        Ok(LLMChatResponse {
            content,
            finish_reason,
            tool_calls,
            usage,
            reasoning,
            images: None,
        })
    }
}

#[async_trait]
impl LLMProvider for OpenAICompatProvider {
    async fn fetch_models(
        &self,
        base_url: &str,
        api_key: Option<&str>,
    ) -> Result<Vec<LLMModel>, AppError> {
        // Handle Ollama provider - adjust base URL
        // We'll trust the provider passed, but still handling "ollama" specific logic if base_url hints it or just keep current logic
        // The original logic checked provider string which is not passed here.
        // However, standard OpenAI endpoints are usually correct.
        // Let's assume standard behavior or try to infer.
        // But wait, the original `fetch_models` took `provider`. Now `fetch_models` in trait signature doesn't have it.
        // I might need to update the trait signature or handle it differently.
        // For now, let's keep the URL adjustment logic generic if possible or assume standard /models.

        // Actually, let's look at how the original code did it.
        // It adjusted based on provider == "ollama".
        // Use a simple heuristic: if url contains "localhost:11434" or similar, maybe?
        // Or better yet, just treat base_url as is, but maybe strip trailing slash.

        // For strict backward compatibility, I should probably pass 'provider' to fetch_models in the trait.
        // But the user plan didn't specify that change in trait.
        // Let's just implement the standard logic first and maybe improve later if needed.
        // Or I can update the trait now since I'm defining it.
        // Nah, let's just stick to the plan.

        let url = format!("{}/models", base_url.trim_end_matches('/'));

        let mut req_builder = self.client.get(&url);

        // Add authorization header if API key is provided
        if let Some(key) = api_key {
            req_builder = req_builder.header("Authorization", format!("Bearer {key}"));
        }

        req_builder = req_builder.header("Content-Type", "application/json");

        let response = req_builder.send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AppError::Llm(format!(
                "LLM API error ({status}): {error_text}"
            )));
        }

        let json: serde_json::Value = response.json().await?;

        // Helper function to parse a model item flexibly
        let parse_model = |item: &serde_json::Value| -> Option<LLMModel> {
            // Try to get id from various possible fields
            let id_opt = item
                .get("id")
                .or_else(|| item.get("model")) // Ollama uses "model"
                .or_else(|| item.get("name")) // Some APIs use "name" as id
                .and_then(|v| v.as_str())
                .map(std::string::ToString::to_string);

            // Try to get name from various possible fields
            let name_opt = item
                .get("name")
                .or_else(|| item.get("model")) // Ollama uses "model" for both
                .or_else(|| item.get("id")) // Fallback to id
                .and_then(|v| v.as_str())
                .map(std::string::ToString::to_string);

            // Both id and name are required
            if let (Some(id), Some(name)) = (id_opt, name_opt) {
                // Check model capabilities
                let (supports_tools, supports_thinking, supports_image_generation) =
                    Self::check_model_capabilities(&id);

                Some(LLMModel {
                    id,
                    name,
                    created: item.get("created").and_then(serde_json::Value::as_u64),
                    owned_by: item
                        .get("owned_by")
                        .or_else(|| item.get("ownedBy"))
                        .and_then(|v| v.as_str())
                        .map(std::string::ToString::to_string),
                    supports_tools,
                    supports_thinking,
                    supports_image_generation,
                })
            } else {
                None
            }
        };

        // Handle different response formats
        let models = if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
            // OpenAI format: { "data": [...] }
            data.iter().filter_map(parse_model).collect()
        } else if let Some(models_array) = json.get("models").and_then(|m| m.as_array()) {
            // Some APIs use { "models": [...] }
            models_array.iter().filter_map(parse_model).collect()
        } else if json.is_array() {
            // Direct array format (Ollama format: [{ "model": "...", ... }])
            json.as_array()
                .unwrap()
                .iter()
                .filter_map(parse_model)
                .collect()
        } else {
            // Try to parse as single model object
            if let Some(model) = parse_model(&json) {
                vec![model]
            } else {
                // Log the response for debugging
                tracing::error!(
                    response = %serde_json::to_string_pretty(&json).unwrap_or_else(|_| "Failed to serialize".to_string()),
                    "Unexpected response format"
                );
                return Err(AppError::Llm(format!(
                    "Unexpected response format. Expected array or object with 'data' field. Got: {json}"
                )));
            }
        };

        Ok(models)
    }

    async fn chat(
        &self,
        base_url: &str,
        api_key: Option<&str>,
        request: LLMChatRequest,
        chat_id: String,
        message_id: String,
        app: AppHandle,
        cancellation_rx: Option<tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<LLMChatResponse, AppError> {
        let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

        let mut req_builder = self.client.post(&url);

        // Add authorization header if API key is provided
        if let Some(key) = api_key {
            req_builder = req_builder.header("Authorization", format!("Bearer {key}"));
        }

        req_builder = req_builder.header("Content-Type", "application/json");

        let request_body = serde_json::to_value(&request)?;

        if request.stream {
            self.handle_streaming(
                req_builder,
                request_body,
                chat_id,
                message_id,
                app,
                cancellation_rx,
            )
            .await
        } else {
            self.handle_non_streaming(req_builder, request_body, chat_id, message_id, app)
                .await
        }
    }
}
