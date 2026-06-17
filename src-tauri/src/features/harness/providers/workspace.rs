//! Executes tools for workspace context (MCP + internal).

use crate::error::AppError;
use crate::features::harness::tool_execution_context::ToolExecutionContext;
use crate::features::tool::service::ToolService;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;

pub struct WorkspaceToolExecutor {
    tool_service: Arc<ToolService>,
    tool_to_connection: HashMap<String, String>,
}

impl WorkspaceToolExecutor {
    pub fn new(
        tool_service: Arc<ToolService>,
        workspace_id: &str,
    ) -> Result<Self, AppError> {
        let tool_to_connection = tool_service.get_tool_to_connection_map(workspace_id)?;
        Ok(Self {
            tool_service,
            tool_to_connection,
        })
    }

    pub async fn execute(
        &self,
        tool_name: &str,
        arguments_str: &str,
        cancellation_rx: &mut broadcast::Receiver<()>,
        timeout_secs: Option<u64>,
        context: &ToolExecutionContext,
    ) -> Result<Value, AppError> {
        let connection_id = self
            .tool_to_connection
            .get(tool_name)
            .ok_or_else(|| {
                AppError::Validation(format!(
                    "Tool {tool_name} not found in any MCP connection"
                ))
            })?;

        let arguments: Value = if arguments_str.trim().is_empty() {
            serde_json::json!({})
        } else {
            serde_json::from_str(arguments_str).map_err(|e| {
                AppError::Validation(format!(
                    "Failed to parse tool arguments for '{tool_name}': {e} (arguments: '{arguments_str}')"
                ))
            })?
        };

        let tool_exec_future = self.tool_service.execute_tool(
            connection_id,
            tool_name,
            arguments,
            Some(context),
        );

        match timeout_secs {
            None => {
                tokio::select! {
                    result = tool_exec_future => result,
                    _ = cancellation_rx.recv() => Err(AppError::Cancelled),
                }
            }
            Some(secs) => {
                tokio::select! {
                    result = tokio::time::timeout(Duration::from_secs(secs), tool_exec_future) => {
                        match result {
                            Ok(r) => r,
                            Err(_) => Err(AppError::Generic(
                                format!("Tool execution timed out after {secs} seconds"),
                            )),
                        }
                    }
                    _ = cancellation_rx.recv() => Err(AppError::Cancelled),
                }
            }
        }
    }
}
