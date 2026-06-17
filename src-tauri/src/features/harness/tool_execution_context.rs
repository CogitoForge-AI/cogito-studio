use tauri::AppHandle;

/// Runtime context passed to tool executors for tools that need chat/session info.
#[derive(Clone)]
pub struct ToolExecutionContext {
    pub app: AppHandle,
    pub chat_id: String,
    pub message_id: String,
    pub tool_call_id: String,
}
