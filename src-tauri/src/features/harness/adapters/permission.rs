use crate::error::AppError;
use crate::events::ToolEmitter;
use crate::features::workspace::settings::WorkspaceSettings;
use crate::models::llm_types::ToolCall;
use std::collections::HashMap;
use tauri::{AppHandle, Manager};

pub async fn filter_tool_permissions(
    app: &AppHandle,
    chat_id: &str,
    assistant_message_id: &str,
    tool_calls: Vec<ToolCall>,
    workspace_settings: &WorkspaceSettings,
) -> Result<Vec<ToolCall>, AppError> {
    let tool_emitter = ToolEmitter::new(app.clone());

    let tool_permission_config: HashMap<String, String> =
        if let Some(config_str) = &workspace_settings.tool_permission_config {
            serde_json::from_str(config_str).unwrap_or_default()
        } else {
            HashMap::new()
        };

    let require_permission = tool_calls.iter().any(|tc| {
        if tc.function.name == "ask_user" {
            return false;
        }
        matches!(
            tool_permission_config
                .get(&tc.function.name)
                .map(std::string::String::as_str),
            Some("require")
        )
    });

    if require_permission {
        let (tx, rx) = tokio::sync::oneshot::channel::<crate::state::PermissionDecision>();

        {
            let app_state: tauri::State<crate::state::AppState> = app.state();
            let mut pending = app_state.pending_tool_permissions.lock().map_err(|e| {
                AppError::Generic(format!("Failed to lock pending_tool_permissions: {e}"))
            })?;
            pending.insert(assistant_message_id.to_string(), tx);
        }

        let permission_tool_calls: Vec<crate::events::ToolCall> = tool_calls
            .iter()
            .map(|tc| crate::events::ToolCall {
                id: tc.id.clone(),
                name: tc.function.name.clone(),
                arguments: serde_json::from_str(tc.function.arguments.trim())
                    .unwrap_or_else(|_| serde_json::json!({})),
            })
            .collect();

        tool_emitter.emit_tool_permission_request(
            chat_id.to_string(),
            assistant_message_id.to_string(),
            permission_tool_calls,
        )?;

        let decision = match tokio::time::timeout(tokio::time::Duration::from_secs(60), rx).await {
            Ok(Ok(decision)) => decision,
            Ok(Err(_)) => {
                return Err(AppError::Generic(
                    "Tool permission request cancelled".to_string(),
                ));
            }
            Err(_) => {
                let app_state: tauri::State<crate::state::AppState> = app.state();
                let mut pending = app_state.pending_tool_permissions.lock().map_err(|e| {
                    AppError::Generic(format!("Failed to lock pending_tool_permissions: {e}"))
                })?;
                pending.remove(assistant_message_id);

                return Err(AppError::Generic(
                    "Tool permission request timed out (60s)".to_string(),
                ));
            }
        };

        if !decision.approved {
            return Err(AppError::Generic(
                "Tool execution denied by user".to_string(),
            ));
        }

        let filtered_calls: Vec<_> = tool_calls
            .into_iter()
            .filter(|tc| decision.allowed_tool_ids.contains(&tc.id))
            .collect();

        if filtered_calls.is_empty() {
            return Err(AppError::Generic("No tools allowed to run".to_string()));
        }

        return Ok(filtered_calls);
    }

    Ok(tool_calls)
}
