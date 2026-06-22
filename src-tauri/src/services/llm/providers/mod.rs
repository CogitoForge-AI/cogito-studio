pub mod anthropic;
pub mod google;
pub mod openai;
pub mod openai_compat;

use crate::error::AppError;
use crate::models::llm_types::{LlmChatParams, LLMChatResponse, LLMModel};
use async_trait::async_trait;
use tauri::AppHandle;

pub use anthropic::AnthropicProvider;
pub use google::GoogleProvider;
pub use openai::OpenAIProvider;
pub use openai_compat::OpenAICompatProvider;

#[async_trait]
pub trait LLMProvider: Send + Sync {
    async fn fetch_models(
        &self,
        base_url: &str,
        api_key: Option<&str>,
    ) -> Result<Vec<LLMModel>, AppError>;

    async fn chat(
        &self,
        base_url: &str,
        api_key: Option<&str>,
        request: LlmChatParams<'_>,
        chat_id: String,
        message_id: String,
        app: AppHandle,
        cancellation_rx: Option<tokio::sync::broadcast::Receiver<()>>,
    ) -> Result<LLMChatResponse, AppError>;
}
