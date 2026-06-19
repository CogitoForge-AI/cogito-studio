use crate::error::AppError;
use crate::features::conversation::types::{ConversationSnapshot, ConversationSummary};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_conversation_state(
    chat_id: String,
    state: State<'_, AppState>,
) -> Result<ConversationSnapshot, AppError> {
    Ok(state.conversation_manager.get_snapshot(&chat_id).await)
}

#[tauri::command]
pub async fn get_active_conversations(
    state: State<'_, AppState>,
) -> Result<Vec<ConversationSummary>, AppError> {
    Ok(state.conversation_manager.list_active().await)
}
