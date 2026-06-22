use serde::{Deserialize, Serialize};

pub use super::model_capabilities::{
    apply_input_modalities, detect_model_capabilities, is_image_generation_model,
    model_supports_tools, ModelCapabilities,
};

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct LLMModel {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owned_by: Option<String>,
    #[serde(default, rename = "supportsImageInput", alias = "supportsVision")]
    pub supports_image_input: bool,
    #[serde(default, rename = "supportsDocumentInput")]
    pub supports_document_input: bool,
    #[serde(default, rename = "supportsAudioInput")]
    pub supports_audio_input: bool,
    #[serde(default, rename = "supportsVideoInput")]
    pub supports_video_input: bool,
    #[serde(default, rename = "supportsTextExtraction")]
    pub supports_text_extraction: bool,
    #[serde(default, rename = "supportsTools")]
    pub supports_tools: bool,
    #[serde(default, rename = "supportsThinking")]
    pub supports_thinking: bool,
    #[serde(default, rename = "supportsImageGeneration")]
    pub supports_image_generation: bool,
}

impl LLMModel {
    pub fn new_with_capabilities(
        id: String,
        name: String,
        created: Option<u64>,
        owned_by: Option<String>,
    ) -> Self {
        Self {
            id: id.clone(),
            name,
            created,
            owned_by,
            ..Default::default()
        }
        .with_detected_capabilities(&id)
    }

    pub fn with_detected_capabilities(mut self, model_id: &str) -> Self {
        let caps = detect_model_capabilities(model_id);
        caps.apply_to_model(&mut self);
        self
    }

    pub const fn with_capabilities(mut self, caps: ModelCapabilities) -> Self {
        caps.apply_to_model(&mut self);
        self
    }
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

/// Borrowed LLM chat parameters — avoids cloning message/tool vectors at call sites.
#[derive(Debug, Serialize)]
pub struct LlmChatParams<'a> {
    pub model: &'a str,
    pub messages: &'a [ChatMessage],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<&'a [ChatCompletionTool]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<&'a ToolChoice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_options: Option<&'a serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_modalities: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_config: Option<&'a ImageConfig>,
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
    pub fn reasoning_text(&self) -> Option<&str> {
        self.reasoning_content
            .as_deref()
            .or_else(|| self.reasoning.as_deref())
            .or_else(|| self.thinking.as_deref())
    }

    pub fn get_reasoning(&self) -> Option<String> {
        self.reasoning_text().map(str::to_string)
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
