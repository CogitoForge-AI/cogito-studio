use crate::error::AppError;
use crate::features::harness::types::{HarnessMessages, MessageBuildContext, PromptContext};
use crate::features::message::Message;
use crate::features::workspace::settings::WorkspaceSettings;
use crate::models::llm_types::{LlmChatParams, LLMChatResponse, ToolCall};
use async_trait::async_trait;
use serde_json::Value;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::broadcast;

/// Loads file content for multimodal message parts.
pub trait FileContentLoader: Send + Sync {
    fn load_file_content(&self, file_path: &str) -> Result<(String, String), AppError>;
}

/// Context for resolving user attachments (native vs extract-to-text).
pub struct AttachmentResolveContext<'a> {
    pub model_id: &'a str,
    pub provider: &'a str,
    pub user_text: &'a str,
    pub file_paths: &'a [String],
}

/// Resolves attachments into provider-safe `UserContent`.
pub trait AttachmentResolver: Send + Sync {
    fn resolve(
        &self,
        ctx: &AttachmentResolveContext<'_>,
    ) -> Result<crate::features::harness::attachment::ResolvedUserContent, AppError>;
}

/// Builds system prompts from workspace settings, skills, and overrides.
pub trait PromptProvider: Send + Sync {
    fn build_system_prompt(&self, ctx: &PromptContext<'_>) -> Result<String, AppError>;
}

/// Builds the full LLM message list for a turn.
pub trait MessageBuilder: Send + Sync {
    fn build_messages(&self, ctx: &MessageBuildContext<'_>) -> Result<HarnessMessages, AppError>;
}

/// Persists and loads conversation history.
pub trait SessionStore: Send + Sync {
    fn load_history(&self, chat_id: &str) -> Result<Vec<Message>, AppError>;

    fn create_assistant_message(
        &self,
        chat_id: &str,
        message_id: &str,
        timestamp: i64,
    ) -> Result<(), AppError>;

    fn update_assistant_content(
        &self,
        message_id: &str,
        content: &str,
        reasoning: Option<&str>,
    ) -> Result<(), AppError>;

    fn update_assistant_metadata(
        &self,
        message_id: &str,
        metadata: Option<String>,
    ) -> Result<(), AppError>;

    fn create_tool_call_message(
        &self,
        chat_id: &str,
        message_id: &str,
        assistant_message_id: &str,
        content: &str,
        timestamp: i64,
    ) -> Result<(), AppError>;

    fn update_tool_call_message(&self, message_id: &str, content: &str) -> Result<(), AppError>;

    fn update_chat_last_message(&self, chat_id: &str, preview: &str) -> Result<(), AppError>;
}

/// Shared dependencies for building an agent session.
pub struct HarnessDeps {
    pub prompt_provider: Arc<dyn PromptProvider>,
    pub message_builder: Arc<dyn MessageBuilder>,
    pub attachment_resolver: Arc<dyn AttachmentResolver>,
    pub session_store: Arc<dyn SessionStore>,
    pub llm_client: Arc<dyn LlmClient>,
    pub hooks: Arc<dyn HarnessHooks>,
    pub tool_deps: Arc<crate::features::tool::core::ToolDeps>,
    pub message_service: Arc<crate::features::message::MessageService>,
}
#[async_trait]
pub trait LlmClient: Send + Sync {
    async fn chat(
        &self,
        base_url: &str,
        api_key: Option<&str>,
        request: LlmChatParams<'_>,
        chat_id: &str,
        message_id: &str,
        app: AppHandle,
        cancellation_rx: Option<broadcast::Receiver<()>>,
        provider: &str,
    ) -> Result<LLMChatResponse, AppError>;
}

/// Lifecycle hooks for UI events, usage, and permissions.
#[async_trait]
pub trait HarnessHooks: Send + Sync {
    async fn on_iteration(
        &self,
        chat_id: &str,
        iteration: usize,
        max_iterations: usize,
        has_tool_calls: bool,
        app: &AppHandle,
    ) -> Result<(), AppError>;

    async fn on_message_started(
        &self,
        chat_id: &str,
        user_message_id: &str,
        assistant_message_id: &str,
        app: &AppHandle,
    ) -> Result<(), AppError>;

    async fn on_tool_calls_detected(
        &self,
        chat_id: &str,
        assistant_message_id: &str,
        tool_calls: &[ToolCall],
        app: &AppHandle,
    ) -> Result<(), AppError>;

    async fn filter_tool_permissions(
        &self,
        app: &AppHandle,
        chat_id: &str,
        assistant_message_id: &str,
        tool_calls: Vec<ToolCall>,
        workspace_settings: &WorkspaceSettings,
    ) -> Result<Vec<ToolCall>, AppError>;

    async fn on_tool_execution_started(
        &self,
        chat_id: &str,
        assistant_message_id: &str,
        count: usize,
        app: &AppHandle,
    ) -> Result<(), AppError>;

    async fn on_tool_execution_progress(
        &self,
        chat_id: &str,
        assistant_message_id: &str,
        tool_call_id: &str,
        tool_name: &str,
        status: &str,
        result: Option<Value>,
        error: Option<String>,
        app: &AppHandle,
    ) -> Result<(), AppError>;

    async fn on_tool_execution_completed(
        &self,
        chat_id: &str,
        assistant_message_id: &str,
        tool_calls_count: usize,
        successful: usize,
        failed: usize,
        app: &AppHandle,
    ) -> Result<(), AppError>;

    async fn on_tool_execution_error(
        &self,
        chat_id: &str,
        assistant_message_id: &str,
        tool_call_id: &str,
        tool_name: &str,
        error: &str,
        app: &AppHandle,
    ) -> Result<(), AppError>;

    fn record_usage(
        &self,
        workspace_id: &str,
        chat_id: &str,
        message_id: &str,
        provider: &str,
        model: &str,
        usage: Option<&crate::models::llm_types::TokenUsage>,
        latency_ms: u64,
        is_stream: bool,
    );

    async fn on_metadata_updated(
        &self,
        chat_id: &str,
        assistant_message_id: &str,
        app: &AppHandle,
    ) -> Result<(), AppError>;
}
