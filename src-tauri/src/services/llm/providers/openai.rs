use super::LLMProvider;
use crate::error::AppError;
use crate::events::{MessageEmitter, TokenUsage as EventTokenUsage, ToolEmitter};
use crate::models::llm_types::{
    AssistantContent, ChatMessage, ContentPart, LLMChatRequest, LLMChatResponse, LLMModel,
    TokenUsage, ToolCall, ToolCallFunction, UserContent,
};
use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use serde_json::json;
use std::sync::Arc;
use tauri::AppHandle;

pub struct OpenAIProvider {
    client: Arc<Client>,
}

impl OpenAIProvider {
    pub const fn new(client: Arc<Client>) -> Self {
        Self { client }
    }

    fn check_model_capabilities(model_id: &str) -> (bool, bool, bool) {
        // Remove provider prefix if exists (e.g., "openai/gpt-4" -> "gpt-4")
        let clean_id = model_id.split('/').next_back().unwrap_or(model_id);
        let model_lower = clean_id.to_lowercase();

        // Image Generation Support:
        // - DALL-E series
        let supports_image_generation = model_lower.contains("dall-e");

        // Image generation models don't support tools or thinking in a chat context
        if supports_image_generation {
            return (false, false, true);
        }

        // Tool Calling Support:
        // - GPT-3.5-turbo and all variants (from June 2023)
        // - All GPT-4 variants (from June 2023)
        // - GPT-4o and variants (from May 2024)
        // - O1 series (from Dec 2024)
        // - O3 series (from Feb 2025)
        // - GPT-5 series (future)
        let supports_tools = (model_lower.starts_with("gpt-4")
            && !model_lower.starts_with("gpt-4o"))
            || model_lower.starts_with("gpt-3.5")
            || model_lower.starts_with("gpt-5")
            || model_lower.starts_with("o1")
            || model_lower.starts_with("o3");

        // Thinking/Reasoning Support:
        // - O1 series: specialized reasoning models with chain-of-thought
        // - O3 series: next-gen reasoning models
        // - GPT-5 series: improved reasoning capabilities
        let supports_thinking = model_lower.starts_with("o1")
            || model_lower.starts_with("o3")
            || model_lower.starts_with("gpt-5");

        (supports_tools, supports_thinking, supports_image_generation)
    }

    /// Transform messages to the new generalized 'input' format for Responses API
    fn transform_messages_to_input(messages: Vec<ChatMessage>) -> Vec<serde_json::Value> {
        messages
            .into_iter()
            .map(|msg| match msg {
                ChatMessage::User { content } => {
                    let content_arr = match content {
                        UserContent::Text(text) => vec![json!({
                            "type": "input_text",
                            "text": text
                        })],
                        UserContent::Parts(parts) => parts
                            .into_iter()
                            .filter_map(|part| match part {
                                ContentPart::Text { text } => Some(json!({
                                    "type": "input_text",
                                    "text": text
                                })),
                                ContentPart::ImageUrl { image_url } => Some(json!({
                                    "type": "input_image",
                                    "image_url": image_url.url
                                })),
                                ContentPart::FileUrl { file_url } => {
                                    tracing::warn!(
                                        mime_type = %file_url.mime_type,
                                        "FileUrl ignored. Automatic file upload not implemented in logic layer."
                                    );
                                    None
                                }
                                ContentPart::InlineData { inline_data } => {
                                    if inline_data.mime_type.starts_with("image/") {
                                        Some(json!({
                                            "type": "input_image",
                                            "image_url": format!(
                                                "data:{};base64,{}",
                                                inline_data.mime_type, inline_data.data
                                            )
                                        }))
                                    } else {
                                        None
                                    }
                                }
                            })
                            .collect(),
                    };
                    json!({
                        "role": "user",
                        "content": content_arr
                    })
                }
                ChatMessage::Assistant { content, tool_calls } => {
                    let content_arr = match content {
                        AssistantContent::Text(text) => {
                             if text.is_empty() {
                                 vec![]
                             } else {
                                 vec![json!({
                                     "type": "output_text", // CORRECTED: output_text
                                     "text": text
                                 })]
                             }
                        },
                        AssistantContent::Parts(parts) => parts.into_iter().filter_map(|part| {
                             match part {
                                 ContentPart::Text { text } => Some(json!({ "type": "output_text", "text": text })), // CORRECTED: output_text
                                 _ => None
                             }
                        }).collect()
                    };

                    let mut obj = json!({
                        "role": "assistant",
                        "content": content_arr
                    });

                    if let Some(tc) = tool_calls {
                        obj.as_object_mut().unwrap().insert("tool_calls".to_string(), json!(tc));
                    }
                    obj
                }
                ChatMessage::System { content } => json!({
                    "role": "system",
                    "content": [{
                        "type": "input_text",
                        "text": content
                    }]
                }),
                ChatMessage::Tool {
                    tool_call_id,
                    content,
                } => json!({
                    "role": "tool",
                    "tool_call_id": tool_call_id,
                    "content": [{
                        "type": "input_text",
                        "text": content
                    }]
                }),
            })
            .collect()
    }

    async fn handle_responses_api(
        &self,
        req_builder: reqwest::RequestBuilder,
        request_body: serde_json::Value,
        chat_id: String,
        message_id: String,
        app: AppHandle,
        mut cancellation_rx: Option<tokio::sync::broadcast::Receiver<()>>,
        is_streaming_requested: bool,
    ) -> Result<LLMChatResponse, AppError> {
        let response = req_builder.json(&request_body).send().await?;

        // Handle error responses before creating emitters
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            let error_msg = format!("OpenAI Responses API error ({status}): {error_text}");

            let message_emitter = MessageEmitter::new(app.clone());
            message_emitter.emit_message_error(
                chat_id.clone(),
                message_id.clone(),
                error_msg.clone(),
            )?;

            return Err(AppError::Llm(error_msg));
        }

        let message_emitter = MessageEmitter::new(app.clone());
        let tool_emitter = ToolEmitter::new(app.clone());

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        // State for aggregation
        let mut full_content = String::new();
        let mut tool_calls: Vec<ToolCall> = Vec::new();
        let mut finish_reason: Option<String> = None;
        let mut final_usage: Option<TokenUsage> = None;
        let tool_calls_emitted = false;

        while let Some(item) = tokio::select! {
            next_item = stream.next() => next_item,
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

            // Parse SSE: Look for double newline
            while let Some(end_idx) = buffer.find("\n\n") {
                let block = buffer[..end_idx].to_string();
                buffer = buffer[end_idx + 2..].to_string();

                // Extract event type and data
                let mut event_type = String::new();
                let mut event_data_str = String::new();

                for line in block.lines() {
                    if let Some(evt) = line.strip_prefix("event: ") {
                        event_type = evt.trim().to_string();
                    } else if let Some(data) = line.strip_prefix("data: ") {
                        event_data_str = data.trim().to_string();
                    }
                }

                if event_data_str == "[DONE]" {
                    continue;
                }

                // If no data, skip
                if event_data_str.is_empty() {
                    continue;
                }

                match serde_json::from_str::<serde_json::Value>(&event_data_str) {
                    Ok(data) => {
                        // Determine event type: check "event:" line first, then "type" field in JSON
                        let type_from_data = data.get("type").and_then(|s| s.as_str());
                        let effective_event_type = if event_type.is_empty() {
                            type_from_data.unwrap_or("unknown")
                        } else {
                            event_type.as_str()
                        };

                        // Log for debugging
                        tracing::debug!(
                            event_type = effective_event_type,
                            data_keys = ?data.as_object().map(|o| o.keys().collect::<Vec<_>>()),
                            "Received SSE event"
                        );

                        match effective_event_type {
                            "response.output_text.delta" | "response.text.delta" => {
                                // Try multiple fields for content
                                let content_candidate = data.get("delta").and_then(|d| d.get("text")).and_then(|s| s.as_str())
                                    .or_else(|| data.get("delta").and_then(|s| s.as_str())) // delta as string
                                    .or_else(|| data.get("text").and_then(|s| s.as_str()))
                                    .or_else(|| data.get("value").and_then(|s| s.as_str()))
                                    .or_else(|| data.get("content").and_then(|s| s.as_str()));

                                if let Some(text) = content_candidate {
                                    full_content.push_str(text);
                                    if is_streaming_requested {
                                        message_emitter.emit_message_chunk(
                                            chat_id.clone(),
                                            message_id.clone(),
                                            text.to_string(),
                                        )?;
                                    }
                                }
                            }
                            "response.output_tool_call" | "response.tool_call" => {
                                // New tool call received
                                let id = data
                                    .get("tool_call_id")
                                    .or_else(|| data.get("id"))
                                    .and_then(|s| s.as_str())
                                    .unwrap_or_default()
                                    .to_string();

                                let name = data
                                    .get("function")
                                    .and_then(|f| f.get("name"))
                                    .and_then(|s| s.as_str())
                                    .unwrap_or_default()
                                    .to_string();

                                let args = data
                                    .get("function")
                                    .and_then(|f| f.get("arguments"))
                                    .and_then(|s| s.as_str())
                                    .unwrap_or_default()
                                    .to_string();

                                // Only add if we have at least a name or ID
                                if !id.is_empty() || !name.is_empty() {
                                    let call = ToolCall {
                                        id,
                                        r#type: "function".to_string(),
                                        function: ToolCallFunction {
                                            name,
                                            arguments: args,
                                        },
                                    };
                                    tool_calls.push(call);
                                }
                            }
                            "response.usage" => {
                                if let Some(u) = data.get("usage") {
                                    final_usage = u.as_object().map(|obj| TokenUsage {
                                        prompt_tokens: obj
                                            .get("prompt_tokens")
                                            .and_then(serde_json::Value::as_u64)
                                            .map(|v| v as u32),
                                        completion_tokens: obj
                                            .get("completion_tokens")
                                            .and_then(serde_json::Value::as_u64)
                                            .map(|v| v as u32),
                                        total_tokens: obj
                                            .get("total_tokens")
                                            .and_then(serde_json::Value::as_u64)
                                            .map(|v| v as u32),
                                    });
                                }
                            }
                            "response.completed" | "response.end" => {
                                if let Some(fr) = data.get("finish_reason").and_then(|v| v.as_str())
                                {
                                    finish_reason = Some(fr.to_string());
                                }
                                if let Some(u) = data.get("usage") {
                                    final_usage = u.as_object().map(|obj| TokenUsage {
                                        prompt_tokens: obj
                                            .get("prompt_tokens")
                                            .and_then(serde_json::Value::as_u64)
                                            .map(|v| v as u32),
                                        completion_tokens: obj
                                            .get("completion_tokens")
                                            .and_then(serde_json::Value::as_u64)
                                            .map(|v| v as u32),
                                        total_tokens: obj
                                            .get("total_tokens")
                                            .and_then(serde_json::Value::as_u64)
                                            .map(|v| v as u32),
                                    });
                                }
                            }
                            "response.output_text.done" | "response.content_part.done" => {
                                // IGNORE to avoid duplication
                            }
                            _ => {
                                // Fallback: Check if 'choices' exists (Legacy format mixed in?)
                                if let Some(choices) =
                                    data.get("choices").and_then(|c| c.as_array())
                                {
                                    for choice in choices {
                                        if let Some(content) = choice
                                            .get("delta")
                                            .and_then(|d| d.get("content"))
                                            .and_then(|s| s.as_str())
                                        {
                                            full_content.push_str(content);
                                            if is_streaming_requested {
                                                message_emitter.emit_message_chunk(
                                                    chat_id.clone(),
                                                    message_id.clone(),
                                                    content.to_string(),
                                                )?;
                                            }
                                        }
                                        if let Some(reason) =
                                            choice.get("finish_reason").and_then(|s| s.as_str())
                                        {
                                            finish_reason = Some(reason.to_string());
                                        }
                                    }
                                }
                                // REMOVED generic fallback extracting 'text'/'content' from unknown events.
                            }
                        }
                    }
                    Err(e) => {
                        if !event_data_str.is_empty() {
                            tracing::error!(error = %e, data = %event_data_str, "Failed to parse SSE data");
                        }
                    }
                }
            }
        }

        // Final tool emission
        if !tool_calls.is_empty() && !tool_calls_emitted {
            let event_tool_calls: Vec<crate::events::ToolCall> = tool_calls
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
                event_tool_calls,
            )?;
        }

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
            reasoning: None,
            images: None,
        })
    }
}

#[async_trait]
impl LLMProvider for OpenAIProvider {
    async fn fetch_models(
        &self,
        base_url: &str,
        api_key: Option<&str>,
    ) -> Result<Vec<LLMModel>, AppError> {
        let url = format!("{}/models", base_url.trim_end_matches('/'));

        let mut req_builder = self.client.get(&url);

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
                "OpenAI API error ({status}): {error_text}"
            )));
        }

        let json: serde_json::Value = response.json().await?;

        // Helper function to parse a model item
        let parse_model = |item: &serde_json::Value| -> Option<LLMModel> {
            let id = item.get("id")?.as_str()?.to_string();
            // OpenAI models typically only have "id" which acts as the name
            let name = item.get("id")?.as_str()?.to_string();

            // Check model capabilities
            let (supports_tools, supports_thinking, supports_image_generation) =
                Self::check_model_capabilities(&id);

            Some(LLMModel {
                id,
                name,
                created: item.get("created").and_then(serde_json::Value::as_u64),
                owned_by: item
                    .get("owned_by")
                    .and_then(|v| v.as_str())
                    .map(std::string::ToString::to_string),
                supports_tools,
                supports_thinking,
                supports_image_generation,
            })
        };

        // Handle OpenAI response format: { "object": "list", "data": [...] }
        let models = if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
            data.iter().filter_map(parse_model).collect()
        } else {
            // Fallback just in case
            return Err(AppError::Llm(format!(
                "Unexpected response format. Expected object with 'data' field. Got: {json}"
            )));
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
        let url = format!("{}/responses", base_url.trim_end_matches('/'));

        let mut req_builder = self.client.post(&url);

        if let Some(key) = api_key {
            req_builder = req_builder.header("Authorization", format!("Bearer {key}"));
        }

        req_builder = req_builder.header("Content-Type", "application/json");

        // Transform to new input format
        let input_messages = Self::transform_messages_to_input(request.messages);

        // Construct body for Responses API
        let mut request_body = json!({
            "model": request.model,
            "input": input_messages,
            "stream": true, // Always stream for event-driven handling
        });

        if let Some(temp) = request.temperature {
            request_body
                .as_object_mut()
                .unwrap()
                .insert("temperature".to_string(), json!(temp));
        }

        // Add tools if present
        if let Some(tools) = request.tools {
            request_body
                .as_object_mut()
                .unwrap()
                .insert("tools".to_string(), json!(tools));
        }

        self.handle_responses_api(
            req_builder,
            request_body,
            chat_id,
            message_id,
            app,
            cancellation_rx,
            request.stream,
        )
        .await
    }
}
