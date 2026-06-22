pub mod cancel;
pub mod providers;

use crate::error::AppError;
use crate::models::llm_types::{LlmChatParams, LLMChatResponse, LLMModel};
use providers::{
    AnthropicProvider, GoogleProvider, LLMProvider, OpenAICompatProvider, OpenAIProvider,
};
use reqwest::Client;
use std::sync::Arc;
use tauri::AppHandle;

pub struct LLMService {
    client: Arc<Client>,
}

impl LLMService {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client: Arc::new(client),
        }
    }

    fn get_provider(&self, provider: &str) -> Box<dyn LLMProvider> {
        match provider.to_lowercase().as_str() {
            "openai" => Box::new(OpenAIProvider::new(self.client.clone())),
            "google" | "gemini" => Box::new(GoogleProvider::new(self.client.clone())),
            "anthropic" | "claude" => Box::new(AnthropicProvider::new(self.client.clone())),
            // Explicitly map known OpenAI-compatible providers for clarity
            "deepseek" | "groq" | "ollama" | "perplexity" | "mistral" | "openrouter"
            | "lmstudio" | "localai" => Box::new(OpenAICompatProvider::new(self.client.clone())),
            // Default fallback to OpenAI compatible for any custom/unknown provider
            _ => Box::new(OpenAICompatProvider::new(self.client.clone())),
        }
    }

    /// Fetch available models from LLM API
    /// Used for connection testing
    pub async fn fetch_models(
        &self,
        base_url: &str,
        api_key: Option<&str>,
        provider: &str,
    ) -> Result<Vec<LLMModel>, AppError> {
        let provider_impl = self.get_provider(provider);
        provider_impl.fetch_models(base_url, api_key).await
    }

    pub async fn chat(
        &self,
        base_url: &str,
        api_key: Option<&str>,
        request: LlmChatParams<'_>,
        chat_id: String,
        message_id: String,
        app: AppHandle,
        cancellation_rx: Option<tokio::sync::broadcast::Receiver<()>>,
        provider: &str,
    ) -> Result<LLMChatResponse, AppError> {
        let provider_impl = self.get_provider(provider);
        provider_impl
            .chat(
                base_url,
                api_key,
                request,
                chat_id,
                message_id,
                app,
                cancellation_rx,
            )
            .await
    }
}

impl Default for LLMService {
    fn default() -> Self {
        Self::new()
    }
}
