use super::models::Chat;
use crate::error::AppError;
use crate::state::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn create_chat(
    id: String,
    workspace_id: String,
    title: String,
    state: State<'_, AppState>,
) -> Result<Chat, AppError> {
    state
        .chat_service
        .create(id, workspace_id, title, None, None)
        .map_err(|e| AppError::Generic(e.to_string()))
}

#[tauri::command]
pub fn get_or_create_specialist_session(
    parent_chat_id: String,
    agent_id: String,
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Chat, AppError> {
    state
        .chat_service
        .get_or_create_specialist_session(parent_chat_id, agent_id, workspace_id)
        .map_err(|e| AppError::Generic(e.to_string()))
}

#[tauri::command]
pub fn get_chats(workspace_id: String, state: State<'_, AppState>) -> Result<Vec<Chat>, AppError> {
    state
        .chat_service
        .get_by_workspace_id(&workspace_id)
        .map_err(|e| AppError::Generic(e.to_string()))
}

#[tauri::command]
pub fn update_chat(
    id: String,
    title: Option<String>,
    last_message: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state
        .chat_service
        .update(id, title, last_message)
        .map_err(|e| AppError::Generic(e.to_string()))
}

#[tauri::command]
pub fn delete_chat(id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    state
        .chat_service
        .delete(id)
        .map_err(|e| AppError::Generic(e.to_string()))
}

#[tauri::command]
pub fn delete_all_chats_by_workspace(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state
        .chat_service
        .delete_by_workspace_id(workspace_id)
        .map_err(|e| AppError::Generic(e.to_string()))
}

#[derive(serde::Serialize)]
pub struct SendMessageResult {
    pub assistant_message_id: String,
}

#[tauri::command]
pub async fn send_message(
    chat_id: String,
    content: String,
    files: Option<Vec<String>>,
    metadata: Option<String>,
    selected_model: Option<String>,
    reasoning_effort: Option<String>,
    llm_connection_id: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SendMessageResult, AppError> {
    let result = state
        .chat_service
        .send_message(
            chat_id.clone(),
            content.clone(),
            files,
            metadata,
            selected_model,
            reasoning_effort,
            llm_connection_id,
            app,
        )
        .await;

    let (assistant_message_id, _) = result.map_err(|e| AppError::Generic(e.to_string()))?;

    Ok(SendMessageResult {
        assistant_message_id,
    })
}

#[tauri::command]
pub async fn edit_and_resend_message(
    chat_id: String,
    message_id: String,
    new_content: String,
    new_files: Option<Vec<String>>,
    metadata: Option<String>,
    selected_model: Option<String>,
    reasoning_effort: Option<String>,
    llm_connection_id: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SendMessageResult, AppError> {
    let (assistant_message_id, _) = state
        .chat_service
        .edit_and_resend_message(
            chat_id,
            message_id,
            new_content,
            new_files,
            metadata,
            selected_model,
            reasoning_effort,
            llm_connection_id,
            app,
        )
        .await
        .map_err(|e| AppError::Generic(e.to_string()))?;

    Ok(SendMessageResult {
        assistant_message_id,
    })
}

#[tauri::command]

pub fn respond_tool_permission(
    message_id: String,
    approved: bool,
    allowed_tool_ids: Option<Vec<String>>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    // Get the sender from pending permissions
    let sender = {
        let mut pending = state.pending_tool_permissions.lock().map_err(|e| {
            AppError::Generic(format!("Failed to lock pending_tool_permissions: {e}"))
        })?;
        pending.remove(&message_id)
    };

    // Send the approval response
    if let Some(sender) = sender {
        let decision = crate::state::PermissionDecision {
            approved,
            allowed_tool_ids: allowed_tool_ids.unwrap_or_default(),
        };
        sender.send(decision).map_err(|_| {
            AppError::Generic(format!(
                "Failed to send approval response for message {message_id}"
            ))
        })?;
        Ok(())
    } else {
        Err(AppError::Validation(format!(
            "No pending tool permission request found for message {message_id}"
        )))
    }
}

#[tauri::command]
pub fn respond_user_question(
    tool_call_id: String,
    answers: Vec<crate::state::UserQuestionAnswerInput>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let pending = {
        let mut map = state.pending_user_questions.lock().map_err(|e| {
            AppError::Generic(format!("Failed to lock pending_user_questions: {e}"))
        })?;
        map.remove(&tool_call_id)
    };

    let Some(pending) = pending else {
        return Err(AppError::Validation(format!(
            "No pending user question request found for tool_call_id {tool_call_id}"
        )));
    };

    // Validate answers against original questions before unblocking
    crate::features::tool::ask_user::resolve_answers_to_llm_format(&pending.questions, &answers)?;

    let response = crate::state::UserQuestionResponse { answers };

    pending.sender.send(response).map_err(|_| {
        AppError::Generic(format!(
            "Failed to send user question response for tool_call_id {tool_call_id}"
        ))
    })?;

    Ok(())
}

#[tauri::command]
pub async fn generate_chat_title(
    chat_id: String,
    user_prompt: String,
    model: Option<String>,
    llm_connection_id: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state
        .chat_service
        .generate_chat_title(app, chat_id, user_prompt, model, llm_connection_id);
    Ok(())
}
