use crate::constants::TauriEvents;
use crate::error::AppError;
use crate::events::{
    MessageCancelledEvent, MessageChunkEvent, MessageCompleteEvent, MessageErrorEvent,
    MessageMetadataUpdatedEvent, MessageStartedEvent, ThinkingChunkEvent,
};
use crate::state::AppState;
use tauri::{AppHandle, Emitter, Manager};

pub struct MessageEmitter {
    app: AppHandle,
}

impl MessageEmitter {
    pub const fn new(app: AppHandle) -> Self {
        Self { app }
    }

    fn resolve_turn_id(&self, chat_id: &str) -> Option<String> {
        self.app
            .try_state::<AppState>()
            .and_then(|state| state.conversation_manager.active_turn_id_sync(chat_id))
    }

    fn persist_content_chunk(&self, message_id: &str, chunk: &str) {
        if let Some(state) = self.app.try_state::<AppState>() {
            state
                .stream_persist
                .schedule_content_append(message_id.to_string(), chunk.to_string());
        }
    }

    fn persist_reasoning_chunk(&self, message_id: &str, chunk: &str) {
        if let Some(state) = self.app.try_state::<AppState>() {
            state
                .stream_persist
                .schedule_reasoning_append(message_id.to_string(), chunk.to_string());
        }
    }

    pub fn emit_message_started(
        &self,
        chat_id: String,
        turn_id: Option<String>,
        user_message_id: String,
        assistant_message_id: String,
    ) -> Result<(), AppError> {
        let turn_id = turn_id.or_else(|| self.resolve_turn_id(&chat_id));
        self.app
            .emit(
                TauriEvents::MESSAGE_STARTED,
                MessageStartedEvent {
                    chat_id,
                    turn_id,
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
        self.persist_content_chunk(&message_id, &chunk);
        let turn_id = self.resolve_turn_id(&chat_id);
        self.app
            .emit(
                TauriEvents::MESSAGE_CHUNK,
                MessageChunkEvent {
                    chat_id,
                    turn_id,
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
        self.persist_reasoning_chunk(&message_id, &chunk);
        let turn_id = self.resolve_turn_id(&chat_id);
        self.app
            .emit(
                TauriEvents::THINKING_CHUNK,
                ThinkingChunkEvent {
                    chat_id,
                    turn_id,
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
        if let Some(state) = self.app.try_state::<AppState>() {
            state.stream_persist.flush_message(&message_id);
        }

        let turn_id = self.resolve_turn_id(&chat_id);

        if let (Some(turn_id), Some(state)) = (turn_id.clone(), self.app.try_state::<AppState>()) {
            let _ = crate::features::conversation::emitter::ConversationEmitter::new(
                self.app.clone(),
            )
            .emit_llm_call_complete(
                chat_id.clone(),
                turn_id,
                message_id.clone(),
                content.clone(),
                token_usage.clone(),
            );
            return Ok(());
        }

        self.app
            .emit(
                TauriEvents::MESSAGE_COMPLETE,
                MessageCompleteEvent {
                    chat_id,
                    turn_id,
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
