use super::LLMProvider;
use crate::error::AppError;
use crate::events::{
    MessageEmitter, TokenUsage as EventTokenUsage, ToolCall as EventToolCall, ToolEmitter,
};
use crate::models::llm_types::{
    detect_model_capabilities, AssistantContent, ChatMessage, ContentPart, LlmChatParams,
    LLMChatResponse, LLMModel, TokenUsage, ToolCall, ToolCallFunction, ToolChoice, UserContent,
};
use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tauri::AppHandle;

pub struct AnthropicProvider {
    client: Arc<Client>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(untagged)]
enum AnthropicMessageContent {
    Text(String),
    Blocks(Vec<AnthropicContentBlock>),
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
enum AnthropicContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
    },
    // Thinking block (beta/extended thinking)
    #[serde(rename = "thinking")]
    Thinking { thinking: String, signature: String },
    #[serde(rename = "image")]
    Image { source: AnthropicImageSource },
}

#[derive(Serialize, Deserialize, Debug)]
struct AnthropicImageSource {
    #[serde(rename = "type")]
    r#type: String, // "base64"
    media_type: String,
    data: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct AnthropicMessage {
    role: String,
    content: AnthropicMessageContent,
}

#[derive(Serialize, Debug)]
struct AnthropicRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    max_tokens: u32,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<AnthropicTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<AnthropicToolChoice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking: Option<AnthropicThinkingConfig>,
}

#[derive(Serialize, Debug)]
struct AnthropicThinkingConfig {
    #[serde(rename = "type")]
    r#type: String, // "enabled"
    budget_tokens: u32,
}

#[derive(Serialize, Debug)]
struct AnthropicTool {
    name: String,
    description: Option<String>,
    input_schema: Value,
}

#[derive(Serialize, Debug)]
#[serde(tag = "type")]
#[serde(rename_all = "snake_case")]
enum AnthropicToolChoice {
    Auto,
    Any,
    Tool { name: String },
}

#[derive(Deserialize, Debug)]
struct AnthropicUsage {
    input_tokens: u32,
    output_tokens: u32,
}

#[derive(Deserialize, Debug)]
struct AnthropicResponse {
    content: Vec<AnthropicContentBlock>,
    usage: AnthropicUsage,
    stop_reason: Option<String>,
}

impl AnthropicProvider {
    pub const fn new(client: Arc<Client>) -> Self {
        Self { client }
    }

    async fn handle_streaming(
        &self,
        req_builder: reqwest::RequestBuilder,
        request_body: AnthropicRequest,
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
        let mut full_thinking = String::new();
        let mut buffer = String::new();
        let mut input_tokens = 0;
        let mut output_tokens = 0;
        let mut finish_reason = None;

        // Track current block state
        let mut current_tool_id = String::new();
        let mut current_tool_name = String::new();
        let mut current_tool_input = String::new();
        let mut _current_block_index: Option<u32> = None;

        let mut tool_calls = Vec::new();

        while let Some(item) = tokio::select! {
            next = stream.next() => next,
             () = async {
                if let Some(ref mut rx) = cancellation_rx {
                    crate::services::llm::cancel::wait_for_broadcast_cancel(rx).await;
                } else {
                    futures::future::pending::<()>().await;
                }
            }, if cancellation_rx.is_some() => {
                return Err(AppError::Cancelled);
            }
        } {
            let chunk = item.map_err(|e| AppError::Generic(format!("Stream error: {e}")))?;
            let text = String::from_utf8_lossy(&chunk);
            buffer.push_str(&text);

            while let Some(end_idx) = buffer.find("\n\n") {
                let event_block = buffer[..end_idx].to_string();
                buffer = buffer[end_idx + 2..].to_string();

                let lines: Vec<&str> = event_block.lines().collect();
                let mut event_type = "";
                let mut event_data = "";

                for line in lines {
                    if let Some(t) = line.strip_prefix("event: ") {
                        event_type = t.trim();
                    } else if let Some(d) = line.strip_prefix("data: ") {
                        event_data = d.trim();
                    }
                }

                if event_type == "content_block_start" {
                    if let Ok(val) = serde_json::from_str::<Value>(event_data) {
                        if let Some(index) = val.get("index").and_then(serde_json::Value::as_u64) {
                            _current_block_index = Some(index as u32);
                        }
                        if let Some(content_block) = val.get("content_block") {
                            if let Some(block_type) =
                                content_block.get("type").and_then(|s| s.as_str())
                            {
                                if block_type == "tool_use" {
                                    current_tool_id = content_block
                                        .get("id")
                                        .and_then(|s| s.as_str())
                                        .unwrap_or_default()
                                        .to_string();
                                    current_tool_name = content_block
                                        .get("name")
                                        .and_then(|s| s.as_str())
                                        .unwrap_or_default()
                                        .to_string();
                                    current_tool_input = String::new();
                                } else if block_type == "thinking" {
                                    // Handle thinking block start if needed
                                }
                            }
                        }
                    }
                } else if event_type == "content_block_delta" {
                    if let Ok(val) = serde_json::from_str::<Value>(event_data) {
                        if let Some(delta) = val.get("delta") {
                            if let Some(delta_type) = delta.get("type").and_then(|s| s.as_str()) {
                                if delta_type == "text_delta" {
                                    if let Some(text) = delta.get("text").and_then(|s| s.as_str()) {
                                        full_content.push_str(text);
                                        message_emitter.emit_message_chunk(
                                            &chat_id,
                                            &message_id,
                                            text,
                                        )?;
                                    }
                                } else if delta_type == "input_json_delta" {
                                    if let Some(partial_json) =
                                        delta.get("partial_json").and_then(|s| s.as_str())
                                    {
                                        current_tool_input.push_str(partial_json);
                                    }
                                } else if delta_type == "thinking_delta" {
                                    if let Some(thinking) =
                                        delta.get("thinking").and_then(|s| s.as_str())
                                    {
                                        full_thinking.push_str(thinking);
                                        message_emitter.emit_thinking_chunk(
                                            &chat_id,
                                            &message_id,
                                            thinking,
                                        )?;
                                    }
                                }
                            }
                        }
                    }
                } else if event_type == "content_block_stop" {
                    // If we were processing a tool use block, finalize it
                    if !current_tool_id.is_empty() {
                        // Try to parse input as JSON
                        let arguments = if current_tool_input.is_empty() {
                            serde_json::json!({})
                        } else {
                            serde_json::from_str(&current_tool_input)
                                .unwrap_or(serde_json::json!({}))
                        };

                        let tool_call = ToolCall {
                            id: current_tool_id.clone(),
                            r#type: "function".to_string(),
                            function: ToolCallFunction {
                                name: current_tool_name.clone(),
                                arguments: current_tool_input.clone(),
                            },
                        };
                        tool_calls.push(tool_call);

                        // Emit tool call detected event immediately
                        tool_emitter.emit_tool_calls_detected(
                            chat_id.clone(),
                            message_id.clone(),
                            vec![EventToolCall {
                                id: current_tool_id.clone(),
                                name: current_tool_name.clone(),
                                arguments,
                            }],
                        )?;

                        // Reset current tool state
                        current_tool_id.clear();
                        current_tool_name.clear();
                        current_tool_input.clear();
                    }
                } else if event_type == "message_start" {
                    if let Ok(val) = serde_json::from_str::<Value>(event_data) {
                        if let Some(usage) = val.get("message").and_then(|m| m.get("usage")) {
                            if let Some(it) = usage
                                .get("input_tokens")
                                .and_then(serde_json::Value::as_u64)
                            {
                                input_tokens = it as u32;
                            }
                        }
                    }
                } else if event_type == "message_delta" {
                    if let Ok(val) = serde_json::from_str::<Value>(event_data) {
                        if let Some(usage) = val.get("usage") {
                            if let Some(ot) = usage
                                .get("output_tokens")
                                .and_then(serde_json::Value::as_u64)
                            {
                                output_tokens = ot as u32;
                            }
                        }
                        if let Some(stop) = val.get("stop_reason").and_then(|s| s.as_str()) {
                            finish_reason = Some(stop.to_string());
                        }
                    }
                }
            }
        }

        message_emitter.emit_message_complete(
            &chat_id,
            &message_id,
            &full_content,
            Some(EventTokenUsage {
                prompt_tokens: Some(input_tokens),
                completion_tokens: Some(output_tokens),
                total_tokens: Some(input_tokens + output_tokens),
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
            usage: Some(TokenUsage {
                prompt_tokens: Some(input_tokens),
                completion_tokens: Some(output_tokens),
                total_tokens: Some(input_tokens + output_tokens),
            }),
            reasoning: if full_thinking.is_empty() {
                None
            } else {
                Some(full_thinking)
            },
            images: None,
        })
    }

    async fn handle_non_streaming(
        &self,
        req_builder: reqwest::RequestBuilder,
        request_body: AnthropicRequest,
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

        let json_response: AnthropicResponse = response
            .json()
            .await
            .map_err(|e| AppError::Generic(format!("Failed to parse response: {e}")))?;

        let mut content_str = String::new();
        let mut thinking_str = String::new();
        let mut tool_calls = Vec::new();
        let tool_emitter = ToolEmitter::new(app.clone());

        for block in json_response.content {
            match block {
                AnthropicContentBlock::Text { text } => content_str.push_str(&text),
                AnthropicContentBlock::Thinking { thinking, .. } => {
                    thinking_str.push_str(&thinking);
                }
                AnthropicContentBlock::ToolUse { id, name, input } => {
                    tool_calls.push(ToolCall {
                        id: id.clone(),
                        r#type: "function".to_string(),
                        function: ToolCallFunction {
                            name: name.clone(),
                            arguments: input.to_string(),
                        },
                    });
                }
                _ => {}
            }
        }

        if !tool_calls.is_empty() {
            let event_tool_calls: Vec<EventToolCall> = tool_calls
                .iter()
                .map(|tc| EventToolCall {
                    id: tc.id.clone(),
                    name: tc.function.name.clone(),
                    arguments: serde_json::from_str(&tc.function.arguments)
                        .unwrap_or(serde_json::json!({})),
                })
                .collect();

            tool_emitter.emit_tool_calls_detected(
                chat_id.clone(),
                message_id.clone(),
                event_tool_calls,
            )?;
        }

        let message_emitter = MessageEmitter::new(app.clone());
        message_emitter.emit_message_complete(
            &chat_id,
            &message_id,
            &content_str,
            Some(EventTokenUsage {
                prompt_tokens: Some(json_response.usage.input_tokens),
                completion_tokens: Some(json_response.usage.output_tokens),
                total_tokens: Some(
                    json_response.usage.input_tokens + json_response.usage.output_tokens,
                ),
            }),
        )?;

        Ok(LLMChatResponse {
            content: content_str,
            finish_reason: json_response.stop_reason,
            tool_calls: if tool_calls.is_empty() {
                None
            } else {
                Some(tool_calls)
            },
            usage: Some(TokenUsage {
                prompt_tokens: Some(json_response.usage.input_tokens),
                completion_tokens: Some(json_response.usage.output_tokens),
                total_tokens: Some(
                    json_response.usage.input_tokens + json_response.usage.output_tokens,
                ),
            }),
            reasoning: if thinking_str.is_empty() {
                None
            } else {
                Some(thinking_str)
            },
            images: None,
        })
    }
}

#[async_trait]
impl LLMProvider for AnthropicProvider {
    async fn fetch_models(
        &self,
        base_url: &str,
        api_key: Option<&str>,
    ) -> Result<Vec<LLMModel>, AppError> {
        let url = format!("{}/v1/models", base_url.trim_end_matches('/'));
        let mut req_builder = self.client.get(&url);

        if let Some(key) = api_key {
            req_builder = req_builder.header("x-api-key", key);
        }
        req_builder = req_builder.header("anthropic-version", "2023-06-01");
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

        let mut models = Vec::new();
        if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
            for item in data {
                if let Some(id) = item.get("id").and_then(|s| s.as_str()) {
                    models.push(LLMModel::new_with_capabilities(
                        id.to_string(),
                        item.get("display_name")
                            .and_then(|s| s.as_str())
                            .unwrap_or(id)
                            .to_string(),
                        item.get("created_at").and_then(|v| v.as_str()).map(|_| 0),
                        Some("anthropic".to_string()),
                    ));
                }
            }
        }

        Ok(models)
    }

    async fn chat(
        &self,
        base_url: &str,
        api_key: Option<&str>,
        request: LlmChatParams<'_>,
        chat_id: String,
        message_id: String,
        app: AppHandle,
        cancellation_rx: Option<tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<LLMChatResponse, AppError> {
        let url = format!("{}/v1/messages", base_url.trim_end_matches('/'));
        let mut req_builder = self.client.post(&url);

        if let Some(key) = api_key {
            req_builder = req_builder.header("x-api-key", key);
        }
        req_builder = req_builder.header("anthropic-version", "2023-06-01");
        req_builder = req_builder.header("Content-Type", "application/json");

        let caps = detect_model_capabilities(&request.model);
        let supports_thinking = caps.thinking;

        // Convert messages
        let mut messages = Vec::new();
        let mut system_prompt = None;

        for msg in request.messages {
            match msg {
                ChatMessage::System { content } => {
                    if let Some(existing) = system_prompt {
                        system_prompt = Some(format!("{existing}\n\n{content}"));
                    } else {
                        system_prompt = Some(content.clone());
                    }
                }
                ChatMessage::User { content } => {
                    match content {
                        UserContent::Text(text) => {
                            messages.push(AnthropicMessage {
                                role: "user".to_string(),
                                content: AnthropicMessageContent::Text(text.clone()),
                            });
                        }
                        UserContent::Parts(parts) => {
                            let mut blocks = Vec::new();
                            for part in parts {
                                match part {
                                    ContentPart::Text { text } => {
                                        blocks.push(AnthropicContentBlock::Text {
                                            text: text.clone(),
                                        });
                                    }
                                    ContentPart::FileUrl { file_url } => {
                                        // Anthropic only supports images
                                        // For non-image files, add a text placeholder
                                        if file_url.mime_type.starts_with("image/") {
                                            if let Some(comma_pos) = file_url.url.find(',') {
                                                let data = &file_url.url[comma_pos + 1..];
                                                let media_type = &file_url.mime_type;

                                                blocks.push(AnthropicContentBlock::Image {
                                                    source: AnthropicImageSource {
                                                        r#type: "base64".to_string(),
                                                        media_type: media_type.to_string(),
                                                        data: data.to_string(),
                                                    },
                                                });
                                            }
                                        } else {
                                            // Non-image files not supported by Anthropic
                                            // Add a text placeholder
                                            blocks.push(AnthropicContentBlock::Text {
                                                text: format!(
                                                    "[File attachment: {} - Not supported by this model]",
                                                    file_url.mime_type
                                                ),
                                            });
                                        }
                                    }
                                    ContentPart::ImageUrl { image_url } => {
                                        // Parse data URL: data:image/jpeg;base64,...
                                        if let Some(comma_pos) = image_url.url.find(',') {
                                            let meta = &image_url.url[..comma_pos];
                                            let data = &image_url.url[comma_pos + 1..];

                                            // Extract mime type
                                            let media_type = if meta.contains("image/png") {
                                                "image/png"
                                            } else if meta.contains("image/jpeg") {
                                                "image/jpeg"
                                            } else if meta.contains("image/webp") {
                                                "image/webp"
                                            } else if meta.contains("image/gif") {
                                                "image/gif"
                                            } else {
                                                "image/jpeg" // Fallback
                                            };

                                            blocks.push(AnthropicContentBlock::Image {
                                                source: AnthropicImageSource {
                                                    r#type: "base64".to_string(),
                                                    media_type: media_type.to_string(),
                                                    data: data.to_string(),
                                                },
                                            });
                                        }
                                    }
                                    ContentPart::InlineData { inline_data } => {
                                        if inline_data.mime_type.starts_with("image/") {
                                            blocks.push(AnthropicContentBlock::Image {
                                                source: AnthropicImageSource {
                                                    r#type: "base64".to_string(),
                                                    media_type: inline_data.mime_type.clone(),
                                                    data: inline_data.data.clone(),
                                                },
                                            });
                                        } else {
                                            // Non-image inline data not supported
                                            blocks.push(AnthropicContentBlock::Text {
                                                text: format!(
                                                    "[Inline data: {} - Not supported by this model]",
                                                    inline_data.mime_type
                                                ),
                                            });
                                        }
                                    }
                                }
                            }
                            messages.push(AnthropicMessage {
                                role: "user".to_string(),
                                content: AnthropicMessageContent::Blocks(blocks),
                            });
                        }
                    }
                }
                ChatMessage::Assistant {
                    content,
                    tool_calls,
                } => {
                    let mut blocks = Vec::new();
                    // Handle AssistantContent
                    match content {
                        AssistantContent::Text(text) => {
                            if !text.is_empty() {
                                blocks.push(AnthropicContentBlock::Text {
                                    text: text.clone(),
                                });
                            }
                        }
                        AssistantContent::Parts(parts) => {
                            for part in parts {
                                if let ContentPart::Text { text } = part {
                                    blocks.push(AnthropicContentBlock::Text {
                                        text: text.clone(),
                                    });
                                }
                            }
                        }
                    }
                    if let Some(tcs) = tool_calls {
                        for tc in tcs {
                            let input_val: Value = serde_json::from_str(&tc.function.arguments)
                                .unwrap_or(serde_json::json!({}));
                            blocks.push(AnthropicContentBlock::ToolUse {
                                id: tc.id.clone(),
                                name: tc.function.name.clone(),
                                input: input_val,
                            });
                        }
                    }

                    messages.push(AnthropicMessage {
                        role: "assistant".to_string(),
                        content: AnthropicMessageContent::Blocks(blocks),
                    });
                }
                ChatMessage::Tool {
                    content,
                    tool_call_id,
                } => {
                    messages.push(AnthropicMessage {
                        role: "user".to_string(), // Tool results are role "user"
                        content: AnthropicMessageContent::Blocks(vec![
                            AnthropicContentBlock::ToolResult {
                                tool_use_id: tool_call_id.clone(),
                                content: content.clone(),
                            },
                        ]),
                    });
                }
            }
        }

        // Handle Tools
        let tools = request.tools.map(|req_tools| {
            req_tools
                .iter()
                .map(|t| AnthropicTool {
                    name: t.function.name.clone(),
                    description: t.function.description.clone(),
                    input_schema: t
                        .function
                        .parameters
                        .clone()
                        .unwrap_or(serde_json::json!({"type": "object", "properties": {}})),
                })
                .collect()
        });

        // Handle Tool Choice
        let tool_choice = if let Some(tc) = request.tool_choice {
            match tc {
                ToolChoice::String(s) if s == "auto" => Some(AnthropicToolChoice::Auto),
                ToolChoice::String(s) if s == "any" => Some(AnthropicToolChoice::Any),
                ToolChoice::Object { function, .. } => Some(AnthropicToolChoice::Tool {
                    name: function.name.clone(),
                }),
                _ => None,
            }
        } else {
            None
        };

        // Handle Thinking
        let thinking = if supports_thinking {
            // Hardcode 1024 tokens for now or fetch from generic request config if available in future
            Some(AnthropicThinkingConfig {
                r#type: "enabled".to_string(),
                budget_tokens: 2048,
            })
        } else {
            None
        };

        // Adjust max_tokens if thinking is enabled to ensure we have room
        let max_tokens = if supports_thinking && request.max_tokens.unwrap_or(0) < 4096 {
            8192 // Bump up for thinking models
        } else {
            request.max_tokens.unwrap_or(4096)
        };

        let anthropic_request = AnthropicRequest {
            model: request.model.to_string(),
            messages,
            max_tokens,
            stream: request.stream,
            system: system_prompt,
            tools,
            tool_choice,
            thinking,
        };

        if request.stream {
            self.handle_streaming(
                req_builder,
                anthropic_request,
                chat_id,
                message_id,
                app,
                cancellation_rx,
            )
            .await
        } else {
            self.handle_non_streaming(req_builder, anthropic_request, chat_id, message_id, app)
                .await
        }
    }
}
