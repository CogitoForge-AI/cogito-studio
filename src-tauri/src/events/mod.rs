use serde::{Deserialize, Serialize};

pub mod agent_emitter;

pub mod tool_emitter;

pub use crate::features::message::MessageEmitter;
pub use agent_emitter::AgentEmitter;
pub use tool_emitter::ToolEmitter;

// Event types for Phase 1 (LLM streaming)
// These will be used when we implement LLM service in Phase 1

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageStartedEvent {
    pub chat_id: String,
    pub user_message_id: String,
    pub assistant_message_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageChunkEvent {
    pub chat_id: String,
    pub message_id: String,
    pub chunk: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ThinkingChunkEvent {
    pub chat_id: String,
    pub message_id: String,
    pub chunk: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageCompleteEvent {
    pub chat_id: String,
    pub message_id: String,
    pub content: String,
    pub token_usage: Option<TokenUsage>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageErrorEvent {
    pub chat_id: String,
    pub message_id: String,
    pub error: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageCancelledEvent {
    pub chat_id: String,
    pub message_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageMetadataUpdatedEvent {
    pub chat_id: String,
    pub message_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
}

// Tool call events for Phase 2
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolCallsDetectedEvent {
    pub chat_id: String,
    pub message_id: String,
    pub tool_calls: Vec<ToolCall>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolExecutionStartedEvent {
    pub chat_id: String,
    pub message_id: String,
    pub tool_calls_count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolExecutionProgressEvent {
    pub chat_id: String,
    pub message_id: String,
    pub tool_call_id: String,
    pub tool_name: String,
    pub status: String, // "executing" | "completed" | "error"
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolExecutionCompletedEvent {
    pub chat_id: String,
    pub message_id: String,
    pub tool_calls_count: usize,
    pub successful_count: usize,
    pub failed_count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolExecutionErrorEvent {
    pub chat_id: String,
    pub message_id: String,
    pub tool_call_id: String,
    pub tool_name: String,
    pub error: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentLoopIterationEvent {
    pub chat_id: String,
    pub iteration: usize,
    pub max_iterations: usize,
    pub has_tool_calls: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolCallEvent {
    pub chat_id: String,
    pub message_id: String,
    pub tool_calls: Vec<ToolCall>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolResultEvent {
    pub chat_id: String,
    pub message_id: String,
    pub tool_call_id: String,
    pub result: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

// Tool permission request event
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolPermissionRequestEvent {
    pub chat_id: String,
    pub message_id: String,
    pub tool_calls: Vec<ToolCall>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatUpdatedEvent {
    pub chat_id: String,
    pub title: String,
}

// Ask user tool events
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserQuestionRequestEvent {
    pub chat_id: String,
    pub message_id: String,
    pub tool_call_id: String,
    pub title: Option<String>,
    pub questions: Vec<crate::state::UserQuestionDefinition>,
}
