use crate::constants::TauriEvents;
use crate::error::AppError;
use crate::events::{
    ToolCall, ToolCallsDetectedEvent, ToolExecutionCompletedEvent, ToolExecutionErrorEvent,
    ToolExecutionProgressEvent, ToolExecutionStartedEvent, ToolPermissionRequestEvent,
    UserQuestionRequestEvent,
};
use tauri::{AppHandle, Emitter};

pub struct ToolEmitter {
    app: AppHandle,
}

impl ToolEmitter {
    pub const fn new(app: AppHandle) -> Self {
        Self { app }
    }

    pub fn emit_tool_calls_detected(
        &self,
        chat_id: String,
        message_id: String,
        tool_calls: Vec<ToolCall>,
    ) -> Result<(), AppError> {
        self.app
            .emit(
                TauriEvents::TOOL_CALLS_DETECTED,
                ToolCallsDetectedEvent {
                    chat_id,
                    message_id,
                    tool_calls,
                },
            )
            .map_err(|e| {
                AppError::Generic(format!("Failed to emit tool-calls-detected event: {e}"))
            })
    }

    pub fn emit_tool_execution_started(
        &self,
        chat_id: String,
        message_id: String,
        tool_calls_count: usize,
    ) -> Result<(), AppError> {
        self.app
            .emit(
                TauriEvents::TOOL_EXECUTION_STARTED,
                ToolExecutionStartedEvent {
                    chat_id,
                    message_id,
                    tool_calls_count,
                },
            )
            .map_err(|e| {
                AppError::Generic(format!("Failed to emit tool-execution-started event: {e}"))
            })
    }

    pub fn emit_tool_execution_progress(
        &self,
        chat_id: String,
        message_id: String,
        tool_call_id: String,
        tool_name: String,
        status: String,
        result: Option<serde_json::Value>,
        error: Option<String>,
    ) -> Result<(), AppError> {
        self.app
            .emit(
                TauriEvents::TOOL_EXECUTION_PROGRESS,
                ToolExecutionProgressEvent {
                    chat_id,
                    message_id,
                    tool_call_id,
                    tool_name,
                    status,
                    result,
                    error,
                },
            )
            .map_err(|e| {
                AppError::Generic(format!("Failed to emit tool-execution-progress event: {e}"))
            })
    }

    pub fn emit_tool_execution_completed(
        &self,
        chat_id: String,
        message_id: String,
        tool_calls_count: usize,
        successful_count: usize,
        failed_count: usize,
    ) -> Result<(), AppError> {
        self.app
            .emit(
                TauriEvents::TOOL_EXECUTION_COMPLETED,
                ToolExecutionCompletedEvent {
                    chat_id,
                    message_id,
                    tool_calls_count,
                    successful_count,
                    failed_count,
                },
            )
            .map_err(|e| {
                AppError::Generic(format!(
                    "Failed to emit tool-execution-completed event: {e}"
                ))
            })
    }

    pub fn emit_tool_execution_error(
        &self,
        chat_id: String,
        message_id: String,
        tool_call_id: String,
        tool_name: String,
        error: String,
    ) -> Result<(), AppError> {
        self.app
            .emit(
                TauriEvents::TOOL_EXECUTION_ERROR,
                ToolExecutionErrorEvent {
                    chat_id,
                    message_id,
                    tool_call_id,
                    tool_name,
                    error,
                },
            )
            .map_err(|e| {
                AppError::Generic(format!("Failed to emit tool-execution-error event: {e}"))
            })
    }

    pub fn emit_tool_permission_request(
        &self,
        chat_id: String,
        message_id: String,
        tool_calls: Vec<ToolCall>,
    ) -> Result<(), AppError> {
        self.app
            .emit(
                TauriEvents::TOOL_PERMISSION_REQUEST,
                ToolPermissionRequestEvent {
                    chat_id,
                    message_id,
                    tool_calls,
                },
            )
            .map_err(|e| {
                AppError::Generic(format!("Failed to emit tool-permission-request event: {e}"))
            })
    }

    pub fn emit_user_question_request(
        &self,
        event: UserQuestionRequestEvent,
    ) -> Result<(), AppError> {
        self.app
            .emit(TauriEvents::USER_QUESTION_REQUEST, event)
            .map_err(|e| {
                AppError::Generic(format!("Failed to emit user-question-request event: {e}"))
            })
    }
}
