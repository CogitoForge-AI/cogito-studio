use crate::constants::TauriEvents;
use crate::error::AppError;
use crate::events::{
    ConversationTurnPhaseChangedEvent, ConversationTurnQueuedEvent,
    ConversationTurnStartedEvent, LlmCallCompleteEvent,
};
use crate::features::conversation::types::{ConversationPhase, TurnStartStatus};
use tauri::{AppHandle, Emitter};

pub struct ConversationEmitter {
    app: AppHandle,
}

impl ConversationEmitter {
    pub const fn new(app: AppHandle) -> Self {
        Self { app }
    }

    pub fn emit_turn_started(
        &self,
        chat_id: String,
        turn_id: String,
        user_message_id: String,
        assistant_message_id: String,
    ) -> Result<(), AppError> {
        self.app
            .emit(
                TauriEvents::CONVERSATION_TURN_STARTED,
                ConversationTurnStartedEvent {
                    chat_id,
                    turn_id,
                    user_message_id,
                    assistant_message_id,
                },
            )
            .map_err(|e| {
                AppError::Generic(format!("Failed to emit conversation-turn-started: {e}"))
            })
    }

    pub fn emit_turn_queued(
        &self,
        chat_id: String,
        turn_id: String,
        assistant_message_id: String,
        queue_depth: usize,
    ) -> Result<(), AppError> {
        self.app
            .emit(
                TauriEvents::CONVERSATION_TURN_QUEUED,
                ConversationTurnQueuedEvent {
                    chat_id,
                    turn_id,
                    assistant_message_id,
                    queue_depth,
                },
            )
            .map_err(|e| AppError::Generic(format!("Failed to emit conversation-turn-queued: {e}")))
    }

    pub fn emit_turn_phase_changed(
        &self,
        chat_id: String,
        turn_id: String,
        phase: ConversationPhase,
    ) -> Result<(), AppError> {
        self.app
            .emit(
                TauriEvents::CONVERSATION_TURN_PHASE_CHANGED,
                ConversationTurnPhaseChangedEvent {
                    chat_id,
                    turn_id,
                    phase,
                },
            )
            .map_err(|e| {
                AppError::Generic(format!("Failed to emit conversation-turn-phase-changed: {e}"))
            })
    }

    pub fn emit_llm_call_complete(
        &self,
        chat_id: String,
        turn_id: String,
        message_id: String,
        content: String,
        token_usage: Option<crate::events::TokenUsage>,
    ) -> Result<(), AppError> {
        let payload = LlmCallCompleteEvent {
            chat_id: chat_id.clone(),
            turn_id: turn_id.clone(),
            message_id: message_id.clone(),
            content: content.clone(),
            token_usage: token_usage.clone(),
        };

        self.app
            .emit(TauriEvents::LLM_CALL_COMPLETE, payload.clone())
            .map_err(|e| AppError::Generic(format!("Failed to emit llm-call-complete: {e}")))?;

        // Deprecated alias — remove in phase 4 cleanup window
        self.app
            .emit(
                TauriEvents::MESSAGE_COMPLETE,
                crate::events::                MessageCompleteEvent {
                    chat_id,
                    turn_id: Some(turn_id),
                    message_id,
                    content,
                    token_usage,
                },
            )
            .map_err(|e| AppError::Generic(format!("Failed to emit message-complete alias: {e}")))
    }

    pub fn emit_turn_start_status(
        &self,
        chat_id: &str,
        turn_id: &str,
        user_message_id: &str,
        assistant_message_id: &str,
        status: TurnStartStatus,
        queue_depth: usize,
    ) -> Result<(), AppError> {
        match status {
            TurnStartStatus::Started => self.emit_turn_started(
                chat_id.to_string(),
                turn_id.to_string(),
                user_message_id.to_string(),
                assistant_message_id.to_string(),
            ),
            TurnStartStatus::Queued => self.emit_turn_queued(
                chat_id.to_string(),
                turn_id.to_string(),
                assistant_message_id.to_string(),
                queue_depth,
            ),
        }
    }
}
