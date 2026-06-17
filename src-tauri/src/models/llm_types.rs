use serde::{Deserialize, Serialize};

/// Returns whether a model is known to support tool/function calling.
pub fn model_supports_tools(model_id: &str) -> bool {
    let clean_id = model_id.split('/').next_back().unwrap_or(model_id);
    let model_lower = clean_id.to_lowercase();

    model_lower.contains("gpt")
        || model_lower.contains("qwen")
        || model_lower.contains("gemini")
        || model_lower.contains("claude")
        || model_lower.contains("minimax")
        || model_lower.starts_with("abab")
        || model_lower.contains("deepseek")
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LLMModel {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owned_by: Option<String>,
    #[serde(default, rename = "supportsTools")]
    pub supports_tools: bool,
    #[serde(default, rename = "supportsThinking")]
    pub supports_thinking: bool,
    #[serde(default, rename = "supportsImageGeneration")]
    pub supports_image_generation: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub r#type: String, // "function" | "custom"
    pub function: ToolCallFunction,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolCallFunction {
    pub name: String,
    pub arguments: String, // JSON string
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "role")]
pub enum ChatMessage {
    #[serde(rename = "system")]
    System { content: String },
    #[serde(rename = "user")]
    User { content: UserContent },
    #[serde(rename = "assistant")]
    Assistant {
        content: AssistantContent,
        #[serde(skip_serializing_if = "Option::is_none")]
        tool_calls: Option<Vec<ToolCall>>,
    },
    #[serde(rename = "tool")]
    Tool {
        content: String,
        tool_call_id: String,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum AssistantContent {
    Text(String),
    Parts(Vec<ContentPart>),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum UserContent {
    Text(String),
    Parts(Vec<ContentPart>),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum ContentPart {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: ImageUrl },
    #[serde(rename = "file_url")]
    FileUrl { file_url: FileUrl },
    #[serde(rename = "inline_data")]
    InlineData { inline_data: InlineData },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageUrl {
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileUrl {
    pub url: String,
    pub mime_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InlineData {
    pub mime_type: String,
    pub data: String, // base64 encoded
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatCompletionTool {
    #[serde(rename = "type")]
    pub r#type: String, // "function"
    pub function: ChatCompletionToolFunction,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatCompletionToolFunction {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum ToolChoice {
    String(String), // "auto" | "none"
    Object {
        #[serde(rename = "type")]
        r#type: String,
        function: ToolChoiceFunction,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolChoiceFunction {
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LLMChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<ChatCompletionTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<ToolChoice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_options: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_modalities: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_config: Option<ImageConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aspect_ratio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_size: Option<String>, // "1K", "2K", "4K"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenUsage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completion_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_tokens: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LLMChatResponse {
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<TokenUsage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<InlineData>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SSEChunk {
    pub id: Option<String>,
    pub object: Option<String>,
    pub created: Option<u64>,
    pub model: Option<String>,
    pub choices: Option<Vec<SSEChoice>>,
    pub usage: Option<TokenUsage>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SSEChoice {
    pub index: Option<u32>,
    pub delta: Option<SSEDelta>,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SSEDelta {
    pub content: Option<String>,
    pub reasoning_content: Option<String>,
    pub reasoning: Option<String>,
    pub thinking: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<SSEToolCall>>,
}

impl SSEDelta {
    pub fn get_reasoning(&self) -> Option<String> {
        self.reasoning_content
            .clone()
            .or(self.reasoning.clone())
            .or(self.thinking.clone())
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SSEToolCall {
    pub index: Option<u32>,
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub r#type: Option<String>,
    pub function: Option<SSEToolCallFunction>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SSEToolCallFunction {
    pub name: Option<String>,
    pub arguments: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::model_supports_tools;

    #[test]
    fn model_supports_tools_includes_minimax_models() {
        assert!(model_supports_tools("MiniMax-Text-01"));
        assert!(model_supports_tools("MiniMax-M1"));
        assert!(model_supports_tools("abab6.5s-chat"));
        assert!(model_supports_tools("openrouter/minimax-m1"));
    }

    #[test]
    fn model_supports_tools_includes_common_providers() {
        assert!(model_supports_tools("gpt-4o"));
        assert!(model_supports_tools("qwen-plus"));
        assert!(model_supports_tools("gemini-2.0-flash"));
        assert!(model_supports_tools("deepseek-chat"));
    }
}
