use crate::error::AppError;
use crate::features::harness::traits::LlmClient;
use crate::models::llm_types::{LlmChatParams, LLMChatResponse};
use crate::services::LLMService;
use async_trait::async_trait;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::broadcast;

pub struct LlmServiceAdapter {
    llm_service: Arc<LLMService>,
}

impl LlmServiceAdapter {
    pub const fn new(llm_service: Arc<LLMService>) -> Self {
        Self { llm_service }
    }
}

#[async_trait]
impl LlmClient for LlmServiceAdapter {
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
    ) -> Result<LLMChatResponse, AppError> {
        self.llm_service
            .chat(
                base_url,
                api_key,
                request,
                chat_id.to_string(),
                message_id.to_string(),
                app,
                cancellation_rx,
                provider,
            )
            .await
    }
}
