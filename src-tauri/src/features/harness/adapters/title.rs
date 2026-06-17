use crate::error::AppError;
use crate::features::chat::ChatEmitter;
use crate::features::chat::repository::ChatRepository;
use crate::features::harness::traits::LlmClient;
use crate::features::llm_connection::LLMConnectionService;
use crate::features::message::models::Message;
use crate::features::message::MessageService;
use crate::features::workspace::settings::WorkspaceSettingsService;
use crate::models::llm_types::{ChatMessage, LLMChatRequest, LLMChatResponse, UserContent};
use std::sync::Arc;
use tauri::AppHandle;

pub struct TitleGenerator {
    llm_client: Arc<dyn LlmClient>,
    chat_repository: Arc<dyn ChatRepository>,
    message_service: Arc<MessageService>,
    llm_connection_service: Arc<LLMConnectionService>,
    workspace_settings_service: Arc<WorkspaceSettingsService>,
}

impl TitleGenerator {
    pub fn new(
        llm_client: Arc<dyn LlmClient>,
        chat_repository: Arc<dyn ChatRepository>,
        message_service: Arc<MessageService>,
        llm_connection_service: Arc<LLMConnectionService>,
        workspace_settings_service: Arc<WorkspaceSettingsService>,
    ) -> Self {
        Self {
            llm_client,
            chat_repository,
            message_service,
            llm_connection_service,
            workspace_settings_service,
        }
    }

    pub fn spawn_title_generation(
        self: Arc<Self>,
        app: AppHandle,
        chat_id: String,
        user_content: String,
        model: Option<String>,
        llm_connection_id: Option<String>,
    ) {
        tokio::spawn(async move {
            let chat_id_for_log = chat_id.clone();
            if let Err(e) = self
                .generate_title(app, chat_id, user_content, model, llm_connection_id)
                .await
            {
                tracing::error!(chat_id = %chat_id_for_log, error = ?e, "Title generation failed");
            }
        });
    }

    pub fn spawn_if_first_user_message(
        self: Arc<Self>,
        app: AppHandle,
        chat_id: String,
        user_content: String,
        model: Option<String>,
        llm_connection_id: Option<String>,
    ) {
        tokio::spawn(async move {
            let user_message_count = match self.message_service.get_by_chat_id(&chat_id) {
                Ok(messages) => count_user_messages(&messages),
                Err(_) => {
                    tracing::error!(chat_id = %chat_id, "Failed to get messages for title generation");
                    return;
                }
            };

            if user_message_count != 1 {
                tracing::debug!(
                    chat_id = %chat_id,
                    user_message_count = user_message_count,
                    "Skipping title generation - not the first user message"
                );
                return;
            }

            let chat_id_for_log = chat_id.clone();
            if let Err(e) = self
                .generate_title(app, chat_id, user_content, model, llm_connection_id)
                .await
            {
                tracing::error!(chat_id = %chat_id_for_log, error = ?e, "Title generation failed");
            }
        });
    }

    pub async fn generate_title(
        &self,
        app: AppHandle,
        chat_id: String,
        user_content: String,
        model: Option<String>,
        llm_connection_id: Option<String>,
    ) -> Result<(), AppError> {
        let (llm_connection, workspace_default_model) = if let Some(conn_id) = llm_connection_id {
            let conn = self
                .llm_connection_service
                .get_by_id(&conn_id)?
                .ok_or_else(|| {
                    AppError::NotFound(format!("LLM connection not found: {conn_id}"))
                })?;
            (conn, None)
        } else {
            let chat = self
                .chat_repository
                .get_by_id(&chat_id)?
                .ok_or_else(|| AppError::NotFound(format!("Chat not found: {chat_id}")))?;
            let settings = self
                .workspace_settings_service
                .get_by_workspace_id(&chat.workspace_id)?
                .ok_or_else(|| AppError::Validation("Workspace settings not found".to_string()))?;
            let conn_id = settings.llm_connection_id.ok_or_else(|| {
                AppError::Validation("LLM connection not configured for workspace".to_string())
            })?;
            let conn = self
                .llm_connection_service
                .get_by_id(&conn_id)?
                .ok_or_else(|| AppError::NotFound(format!("LLM connection not found: {conn_id}")))?;
            (conn, settings.default_model.clone())
        };

        let model = model
            .or(workspace_default_model)
            .or(llm_connection.default_model.clone())
            .filter(|m| !m.is_empty())
            .ok_or_else(|| AppError::Validation("No model available for title generation".to_string()))?;

        let messages = vec![
            ChatMessage::System {
                content: "You are a concise chat title generator. Generate a short title (3-6 words) in the same language as the user's message. Output only the title text without quotes, markdown, or punctuation.".to_string(),
            },
            ChatMessage::User {
                content: UserContent::Text(format!("User Prompt: {user_content}")),
            },
        ];

        let request = LLMChatRequest {
            model: model.clone(),
            messages,
            temperature: Some(0.3),
            // Reasoning models can spend most of a small budget on thinking tokens.
            max_tokens: Some(256),
            stream: false,
            tools: None,
            tool_choice: None,
            reasoning_effort: None,
            stream_options: None,
            response_modalities: None,
            image_config: None,
        };

        let response = self
            .llm_client
            .chat(
                &llm_connection.base_url,
                Some(&llm_connection.api_key),
                request,
                "system_auto_rename",
                &format!("rename_{chat_id}"),
                app.clone(),
                None,
                &llm_connection.provider,
            )
            .await?;

        let title = resolve_title(&response, &user_content);

        let Some(title) = title else {
            tracing::debug!(chat_id = %chat_id, "No usable title generated");
            return Ok(());
        };

        self.chat_repository
            .update(&chat_id, Some(&title), None)?;

        tracing::info!(chat_id = %chat_id, title = %title, "Emitting chat_updated event");
        ChatEmitter::new(app).emit_chat_updated(chat_id, title)?;

        Ok(())
    }
}

fn count_user_messages(messages: &[Message]) -> usize {
    messages.iter().filter(|m| m.role == "user").count()
}

const MIN_TITLE_LEN: usize = 3;
const MAX_TITLE_LEN: usize = 60;

fn resolve_title(response: &LLMChatResponse, user_content: &str) -> Option<String> {
    let llm_title = clean_title(&response.content);
    if is_acceptable_title(&llm_title) {
        return Some(truncate_title(&llm_title));
    }

    fallback_title_from_user_content(user_content)
}

fn clean_title(raw: &str) -> String {
    let mut title = raw.trim().to_string();
    if title.starts_with('"') && title.ends_with('"') && title.len() > 2 {
        title = title[1..title.len() - 1].to_string();
    }
    title.trim().to_string()
}

fn is_acceptable_title(title: &str) -> bool {
    title.chars().count() >= MIN_TITLE_LEN
}

fn truncate_title(title: &str) -> String {
    title.chars().take(MAX_TITLE_LEN).collect::<String>().trim().to_string()
}

fn fallback_title_from_user_content(user_content: &str) -> Option<String> {
    let first_line = user_content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())?;

    if first_line.is_empty() {
        return None;
    }

    Some(truncate_title(first_line))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_truncated_llm_title_and_falls_back_to_user_prompt() {
        let response = LLMChatResponse {
            content: "Gi".to_string(),
            finish_reason: None,
            tool_calls: None,
            usage: None,
            reasoning: None,
            images: None,
        };

        let title = resolve_title(&response, "Giải thích về Rust ownership").unwrap();
        assert_eq!(title, "Giải thích về Rust ownership");
    }

    #[test]
    fn accepts_valid_llm_title() {
        let response = LLMChatResponse {
            content: "Rust Ownership Basics".to_string(),
            finish_reason: None,
            tool_calls: None,
            usage: None,
            reasoning: None,
            images: None,
        };

        let title = resolve_title(&response, "ignored").unwrap();
        assert_eq!(title, "Rust Ownership Basics");
    }
}
