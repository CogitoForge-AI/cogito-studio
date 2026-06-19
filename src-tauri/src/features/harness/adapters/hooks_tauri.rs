use crate::error::AppError;
use crate::events::{AgentEmitter, MessageEmitter, ToolEmitter};
use crate::features::conversation::emitter::ConversationEmitter;
use crate::features::conversation::types::{ConversationPhase, ConversationPhaseKind};
use crate::features::harness::adapters::permission::filter_tool_permissions;
use crate::features::harness::traits::HarnessHooks;
use crate::features::usage::UsageService;
use crate::features::workspace::settings::WorkspaceSettings;
use crate::models::llm_types::ToolCall;
use crate::state::AppState;
use async_trait::async_trait;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

pub struct TauriHarnessHooks {
    usage_service: Arc<UsageService>,
}

impl TauriHarnessHooks {
    pub fn new(usage_service: Arc<UsageService>) -> Self {
        Self { usage_service }
    }

    async fn emit_phase(
        app: &AppHandle,
        chat_id: &str,
        kind: ConversationPhaseKind,
        active_message_id: &str,
        tool_call_id: Option<String>,
    ) -> Result<(), AppError> {
        let Some(state) = app.try_state::<AppState>() else {
            return Ok(());
        };

        let turn_id = state
            .conversation_manager
            .active_turn_id_sync(chat_id)
            .unwrap_or_else(|| "unknown".to_string());

        let phase = ConversationPhase {
            kind,
            turn_id: Some(turn_id.clone()),
            active_message_id: Some(active_message_id.to_string()),
            iteration: None,
            tool_call_id,
            error: None,
        };

        state
            .conversation_manager
            .set_phase(chat_id, phase.clone())
            .await;

        ConversationEmitter::new(app.clone()).emit_turn_phase_changed(
            chat_id.to_string(),
            turn_id,
            phase,
        )
    }
}

#[async_trait]
impl HarnessHooks for TauriHarnessHooks {
    async fn on_iteration(
        &self,
        chat_id: &str,
        iteration: usize,
        max_iterations: usize,
        has_tool_calls: bool,
        app: &AppHandle,
    ) -> Result<(), AppError> {
        AgentEmitter::new(app.clone()).emit_agent_loop_iteration(
            chat_id.to_string(),
            iteration,
            max_iterations,
            has_tool_calls,
        )
    }

    async fn on_message_started(
        &self,
        chat_id: &str,
        user_message_id: &str,
        assistant_message_id: &str,
        app: &AppHandle,
    ) -> Result<(), AppError> {
        MessageEmitter::new(app.clone()).emit_message_started(
            chat_id.to_string(),
            None,
            user_message_id.to_string(),
            assistant_message_id.to_string(),
        )?;

        Self::emit_phase(
            app,
            chat_id,
            ConversationPhaseKind::RunningLlm,
            assistant_message_id,
            None,
        )
        .await
    }

    async fn on_tool_calls_detected(
        &self,
        chat_id: &str,
        assistant_message_id: &str,
        tool_calls: &[ToolCall],
        app: &AppHandle,
    ) -> Result<(), AppError> {
        let mapped: Vec<crate::events::ToolCall> = tool_calls
            .iter()
            .map(|tc| crate::events::ToolCall {
                id: tc.id.clone(),
                name: tc.function.name.clone(),
                arguments: serde_json::from_str(tc.function.arguments.trim())
                    .unwrap_or_else(|_| serde_json::json!({})),
            })
            .collect();

        ToolEmitter::new(app.clone()).emit_tool_calls_detected(
            chat_id.to_string(),
            assistant_message_id.to_string(),
            mapped,
        )
    }

    async fn filter_tool_permissions(
        &self,
        app: &AppHandle,
        chat_id: &str,
        assistant_message_id: &str,
        tool_calls: Vec<ToolCall>,
        workspace_settings: &WorkspaceSettings,
    ) -> Result<Vec<ToolCall>, AppError> {
        filter_tool_permissions(
            app,
            chat_id,
            assistant_message_id,
            tool_calls,
            workspace_settings,
        )
        .await
    }

    async fn on_tool_execution_started(
        &self,
        chat_id: &str,
        assistant_message_id: &str,
        count: usize,
        app: &AppHandle,
    ) -> Result<(), AppError> {
        ToolEmitter::new(app.clone()).emit_tool_execution_started(
            chat_id.to_string(),
            assistant_message_id.to_string(),
            count,
        )?;

        Self::emit_phase(
            app,
            chat_id,
            ConversationPhaseKind::RunningTools,
            assistant_message_id,
            None,
        )
        .await
    }

    async fn on_tool_execution_progress(
        &self,
        chat_id: &str,
        assistant_message_id: &str,
        tool_call_id: &str,
        tool_name: &str,
        status: &str,
        result: Option<serde_json::Value>,
        error: Option<String>,
        app: &AppHandle,
    ) -> Result<(), AppError> {
        if status == "waiting_for_user" {
            Self::emit_phase(
                app,
                chat_id,
                ConversationPhaseKind::WaitingUser,
                assistant_message_id,
                Some(tool_call_id.to_string()),
            )
            .await?;
        }

        ToolEmitter::new(app.clone()).emit_tool_execution_progress(
            chat_id.to_string(),
            assistant_message_id.to_string(),
            tool_call_id.to_string(),
            tool_name.to_string(),
            status.to_string(),
            result,
            error,
        )
    }

    async fn on_tool_execution_completed(
        &self,
        chat_id: &str,
        assistant_message_id: &str,
        tool_calls_count: usize,
        successful: usize,
        failed: usize,
        app: &AppHandle,
    ) -> Result<(), AppError> {
        ToolEmitter::new(app.clone()).emit_tool_execution_completed(
            chat_id.to_string(),
            assistant_message_id.to_string(),
            tool_calls_count,
            successful,
            failed,
        )
    }

    async fn on_tool_execution_error(
        &self,
        chat_id: &str,
        assistant_message_id: &str,
        tool_call_id: &str,
        tool_name: &str,
        error: &str,
        app: &AppHandle,
    ) -> Result<(), AppError> {
        ToolEmitter::new(app.clone()).emit_tool_execution_error(
            chat_id.to_string(),
            assistant_message_id.to_string(),
            tool_call_id.to_string(),
            tool_name.to_string(),
            error.to_string(),
        )
    }

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
    ) {
        let usage_service = self.usage_service.clone();
        let r_workspace_id = workspace_id.to_string();
        let r_chat_id = chat_id.to_string();
        let r_message_id = message_id.to_string();
        let r_provider = provider.to_string();
        let r_model = model.to_string();
        let r_usage = usage.cloned();

        tokio::task::spawn_blocking(move || {
            if let Err(e) = usage_service.record_usage(
                r_workspace_id,
                r_chat_id,
                r_message_id,
                r_provider,
                r_model,
                r_usage,
                latency_ms,
                is_stream,
                "success".to_string(),
            ) {
                tracing::error!(error = ?e, "Failed to record usage");
            }
        });
    }

    async fn on_metadata_updated(
        &self,
        chat_id: &str,
        assistant_message_id: &str,
        app: &AppHandle,
    ) -> Result<(), AppError> {
        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
        MessageEmitter::new(app.clone()).emit_message_metadata_updated(
            chat_id.to_string(),
            assistant_message_id.to_string(),
        )
    }
}
