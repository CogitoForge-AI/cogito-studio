use super::models::Message;
use super::repository::MessageRepository;
use crate::error::AppError;
use std::sync::Arc;

pub struct MessageService {
    repository: Arc<dyn MessageRepository>,
}

impl MessageService {
    pub fn new(repository: Arc<dyn MessageRepository>) -> Self {
        Self { repository }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create(
        &self,
        id: String,
        chat_id: String,
        role: String,
        content: String,
        timestamp: Option<i64>,
        assistant_message_id: Option<String>,
        tool_call_id: Option<String>,
        metadata: Option<String>,
    ) -> Result<Message, AppError> {
        let timestamp = timestamp.unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64
        });

        let message = Message {
            id,
            chat_id,
            role,
            content,
            timestamp,
            assistant_message_id,
            tool_call_id,
            metadata,
            reasoning: None,
        };

        self.repository.create(&message)?;
        Ok(message)
    }

    pub fn get_by_chat_id(&self, chat_id: &str) -> Result<Vec<Message>, AppError> {
        self.repository.get_by_chat_id(chat_id)
    }

    pub fn get_by_id(&self, id: &str) -> Result<Option<Message>, AppError> {
        self.repository.get_by_id(id)
    }

    pub fn update(
        &self,
        id: String,
        content: String,
        reasoning: Option<String>,
        timestamp: Option<i64>,
    ) -> Result<(), AppError> {
        self.repository
            .update(&id, &content, reasoning.as_deref(), timestamp)
    }

    pub fn update_metadata(&self, id: String, metadata: Option<String>) -> Result<(), AppError> {
        self.repository.update_metadata(&id, metadata.as_deref())
    }

    pub fn delete(&self, id: String) -> Result<(), AppError> {
        self.repository.delete(&id)
    }

    pub fn delete_messages_after(
        &self,
        chat_id: String,
        message_id: String,
    ) -> Result<(), AppError> {
        self.repository.delete_messages_after(&chat_id, &message_id)
    }

    pub fn append_content(&self, id: &str, content_delta: &str) -> Result<(), AppError> {
        self.repository.append_content(id, content_delta)
    }

    pub fn append_reasoning(&self, id: &str, reasoning_delta: &str) -> Result<(), AppError> {
        self.repository.append_reasoning(id, reasoning_delta)
    }
}
