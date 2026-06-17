use crate::constants::TauriEvents;
use crate::error::AppError;
use crate::events::{
    MessageCancelledEvent, MessageChunkEvent, MessageCompleteEvent, MessageErrorEvent,
    MessageMetadataUpdatedEvent, MessageStartedEvent, ThinkingChunkEvent,
};
use tauri::{AppHandle, Emitter};

pub struct MessageEmitter {
    app: AppHandle,
}

impl MessageEmitter {
    pub const fn new(app: AppHandle) -> Self {
        Self { app }
    }

    pub fn emit_message_started(
        &self,
        chat_id: String,
        user_message_id: String,
        assistant_message_id: String,
    ) -> Result<(), AppError> {
        self.app
            .emit(
                TauriEvents::MESSAGE_STARTED,
                MessageStartedEvent {
                    chat_id,
                    user_message_id,
                    assistant_message_id,
                },
            )
            .map_err(|e| AppError::Generic(format!("Failed to emit message-started event: {e}")))
    }

    pub fn emit_message_chunk(
        &self,
        chat_id: String,
        message_id: String,
        chunk: String,
    ) -> Result<(), AppError> {
        self.app
            .emit(
                TauriEvents::MESSAGE_CHUNK,
                MessageChunkEvent {
                    chat_id,
                    message_id,
                    chunk,
                },
            )
            .map_err(|e| AppError::Generic(format!("Failed to emit message-chunk event: {e}")))
    }

    pub fn emit_thinking_chunk(
        &self,
        chat_id: String,
        message_id: String,
        chunk: String,
    ) -> Result<(), AppError> {
        self.app
            .emit(
                TauriEvents::THINKING_CHUNK,
                ThinkingChunkEvent {
                    chat_id,
                    message_id,
                    chunk,
                },
            )
            .map_err(|e| AppError::Generic(format!("Failed to emit thinking-chunk event: {e}")))
    }

    pub fn emit_message_complete(
        &self,
        chat_id: String,
        message_id: String,
        content: String,
        token_usage: Option<crate::events::TokenUsage>,
    ) -> Result<(), AppError> {
        self.app
            .emit(
                TauriEvents::MESSAGE_COMPLETE,
                MessageCompleteEvent {
                    chat_id,
                    message_id,
                    content,
                    token_usage,
                },
            )
            .map_err(|e| AppError::Generic(format!("Failed to emit message-complete event: {e}")))
    }

    pub fn emit_message_error(
        &self,
        chat_id: String,
        message_id: String,
        error: String,
    ) -> Result<(), AppError> {
        self.app
            .emit(
                TauriEvents::MESSAGE_ERROR,
                MessageErrorEvent {
                    chat_id,
                    message_id,
                    error,
                },
            )
            .map_err(|e| AppError::Generic(format!("Failed to emit message-error event: {e}")))
    }

    pub fn emit_message_cancelled(
        &self,
        chat_id: String,
        message_id: String,
    ) -> Result<(), AppError> {
        self.app
            .emit(
                TauriEvents::MESSAGE_CANCELLED,
                MessageCancelledEvent {
                    chat_id,
                    message_id,
                },
            )
            .map_err(|e| AppError::Generic(format!("Failed to emit message-cancelled event: {e}")))
    }

    pub fn emit_message_metadata_updated(
        &self,
        chat_id: String,
        message_id: String,
    ) -> Result<(), AppError> {
        self.app
            .emit(
                TauriEvents::MESSAGE_METADATA_UPDATED,
                MessageMetadataUpdatedEvent {
                    chat_id,
                    message_id,
                },
            )
            .map_err(|e| {
                AppError::Generic(format!(
                    "Failed to emit message-metadata-updated event: {e}"
                ))
            })
    }
}
