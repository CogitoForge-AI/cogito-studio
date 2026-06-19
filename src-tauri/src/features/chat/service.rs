use super::models::Chat;
use super::repository::ChatRepository;
use crate::error::AppError;
use crate::features::artifacts::ArtifactService;
use crate::features::conversation::manager::ConversationJobManager;
use crate::features::conversation::types::{StartTurnResult, TurnWorkItem};
use crate::features::harness::{HarnessFactory, MessageTurnRequest};
use crate::features::llm_connection::LLMConnectionService;
use crate::features::message::{MessageEmitter, MessageService};
use crate::features::workspace::settings::WorkspaceSettingsService;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::oneshot;

struct PreparedTurn {
    turn_id: String,
    user_message_id: String,
    assistant_message_id: String,
    turn_request: MessageTurnRequest,
}

pub struct ChatService {
    pub(crate) repository: Arc<dyn ChatRepository>,
    pub(crate) message_service: Arc<MessageService>,
    workspace_settings_service: Arc<WorkspaceSettingsService>,
    llm_connection_service: Arc<LLMConnectionService>,
    harness_factory: Arc<HarnessFactory>,
    artifact_service: Arc<ArtifactService>,
    conversation_manager: Arc<ConversationJobManager>,
}

impl ChatService {
    pub fn new(
        repository: Arc<dyn ChatRepository>,
        message_service: Arc<MessageService>,
        workspace_settings_service: Arc<WorkspaceSettingsService>,
        llm_connection_service: Arc<LLMConnectionService>,
        harness_factory: Arc<HarnessFactory>,
        artifact_service: Arc<ArtifactService>,
        conversation_manager: Arc<ConversationJobManager>,
    ) -> Self {
        Self {
            repository,
            message_service,
            workspace_settings_service,
            llm_connection_service,
            harness_factory,
            artifact_service,
            conversation_manager,
        }
    }

    pub fn cancel_message(&self, chat_id: &str) -> Result<(), AppError> {
        futures::executor::block_on(self.conversation_manager.cancel_turn(chat_id))
    }

    pub fn create(
        &self,
        id: String,
        workspace_id: String,
        title: String,
        agent_id: Option<String>,
        parent_id: Option<String>,
    ) -> Result<Chat, AppError> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;

        let chat = Chat {
            id,
            workspace_id,
            title,
            last_message: None,
            created_at: now,
            updated_at: now,
            agent_id,
            parent_id,
        };

        self.repository.create(&chat)?;
        Ok(chat)
    }

    pub fn get_or_create_specialist_session(
        &self,
        parent_chat_id: String,
        agent_id: String,
        workspace_id: String,
    ) -> Result<Chat, AppError> {
        if let Some(chat) = self
            .repository
            .get_specialist_session(&parent_chat_id, &agent_id)?
        {
            return Ok(chat);
        }

        let title = format!("Specialist: {agent_id}");
        self.create(
            uuid::Uuid::new_v4().to_string(),
            workspace_id,
            title,
            Some(agent_id),
            Some(parent_chat_id),
        )
    }

    pub fn get_by_workspace_id(&self, workspace_id: &str) -> Result<Vec<Chat>, AppError> {
        self.repository.get_by_workspace_id(workspace_id)
    }

    #[allow(dead_code)]
    pub fn get_by_id(&self, id: &str) -> Result<Option<Chat>, AppError> {
        self.repository.get_by_id(id)
    }

    pub fn update(
        &self,
        id: String,
        title: Option<String>,
        last_message: Option<String>,
    ) -> Result<(), AppError> {
        self.repository
            .update(&id, title.as_deref(), last_message.as_deref())
    }

    pub fn delete(&self, id: String) -> Result<(), AppError> {
        self.artifact_service.delete_by_chat(&id)?;
        self.repository.delete(&id)
    }

    pub fn delete_by_workspace_id(&self, workspace_id: String) -> Result<(), AppError> {
        let chats = self.repository.get_by_workspace_id(&workspace_id)?;
        for chat in &chats {
            self.artifact_service.delete_by_chat(&chat.id)?;
        }
        self.repository.delete_by_workspace_id(&workspace_id)
    }

    pub fn process_agent_request(
        self: Arc<Self>,
        chat_id: String,
        prompt: String,
        app: AppHandle,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<String, AppError>> + Send>> {
        Box::pin(async move {
            self.send_message_and_wait(chat_id, prompt, None, None, None, None, None, app)
                .await
                .map(|(_, content)| content)
        })
    }

    pub async fn send_message(
        &self,
        chat_id: String,
        content: String,
        files: Option<Vec<String>>,
        metadata: Option<String>,
        selected_model: Option<String>,
        reasoning_effort: Option<String>,
        llm_connection_id_override: Option<String>,
        app: AppHandle,
    ) -> Result<StartTurnResult, AppError> {
        let prepared = self
            .prepare_turn(
                chat_id,
                content,
                files,
                metadata,
                selected_model,
                reasoning_effort,
                llm_connection_id_override,
                &app,
            )
            .await?;

        let work = TurnWorkItem {
            turn_id: prepared.turn_id.clone(),
            user_message_id: prepared.user_message_id.clone(),
            assistant_message_id: prepared.assistant_message_id.clone(),
            request: prepared.turn_request,
            completion: None,
        };

        self.conversation_manager
            .enqueue_turn(app, work)
            .await
    }

    async fn send_message_and_wait(
        &self,
        chat_id: String,
        content: String,
        files: Option<Vec<String>>,
        metadata: Option<String>,
        selected_model: Option<String>,
        reasoning_effort: Option<String>,
        llm_connection_id_override: Option<String>,
        app: AppHandle,
    ) -> Result<(String, String), AppError> {
        let prepared = self
            .prepare_turn(
                chat_id.clone(),
                content,
                files,
                metadata,
                selected_model,
                reasoning_effort,
                llm_connection_id_override,
                &app,
            )
            .await?;

        let (tx, rx) = oneshot::channel();
        let work = TurnWorkItem {
            turn_id: prepared.turn_id.clone(),
            user_message_id: prepared.user_message_id.clone(),
            assistant_message_id: prepared.assistant_message_id.clone(),
            request: prepared.turn_request,
            completion: Some(tx),
        };

        self.conversation_manager
            .enqueue_turn(app, work)
            .await?;

        rx.await
            .map_err(|_| AppError::Generic("Turn completion channel closed".to_string()))?
    }

    async fn prepare_turn(
        &self,
        chat_id: String,
        content: String,
        files: Option<Vec<String>>,
        metadata: Option<String>,
        selected_model: Option<String>,
        reasoning_effort: Option<String>,
        llm_connection_id_override: Option<String>,
        app: &AppHandle,
    ) -> Result<PreparedTurn, AppError> {
        crate::lib::sentry_helpers::add_breadcrumb(
            "chat",
            format!("Sending message to chat {chat_id}"),
            sentry::Level::Info,
        );

        let processed_files = self.harness_factory.process_incoming_files(app, files)?;
        let final_metadata = self
            .harness_factory
            .merge_file_metadata(metadata.as_deref(), processed_files.as_deref());

        let chat = self
            .repository
            .get_by_id(&chat_id)?
            .ok_or_else(|| AppError::NotFound(format!("Chat not found: {chat_id}")))?;

        let workspace_id = chat.workspace_id;
        crate::lib::sentry_helpers::track_workspace_operation(&workspace_id, "send_message");

        let workspace_settings = self
            .workspace_settings_service
            .get_by_workspace_id(&workspace_id)?
            .ok_or_else(|| AppError::Validation("Workspace settings not found".to_string()))?;

        let llm_connection_id = llm_connection_id_override
            .or(workspace_settings.llm_connection_id.clone())
            .ok_or_else(|| {
                AppError::Validation("LLM connection not configured for workspace".to_string())
            })?;

        let llm_connection = self
            .llm_connection_service
            .get_by_id(&llm_connection_id)?
            .ok_or_else(|| {
                AppError::NotFound(format!("LLM connection not found: {llm_connection_id}"))
            })?;

        let model = selected_model
            .clone()
            .or(workspace_settings.default_model.clone())
            .or(llm_connection.default_model.clone())
            .ok_or_else(|| AppError::Validation("No model selected".to_string()))?;

        let existing_messages = self.message_service.get_by_chat_id(&chat_id)?;
        let is_first_message = existing_messages.is_empty();
        let user_timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        let user_message_id = uuid::Uuid::new_v4().to_string();
        let turn_id = uuid::Uuid::new_v4().to_string();

        self.message_service.create(
            user_message_id.clone(),
            chat_id.clone(),
            "user".to_string(),
            content.clone(),
            Some(user_timestamp),
            None,
            None,
            final_metadata,
        )?;

        if is_first_message {
            self.harness_factory.spawn_title_generation(
                app.clone(),
                chat_id.clone(),
                content.clone(),
                Some(model.clone()),
                Some(llm_connection_id.clone()),
            );
        }

        let assistant_message_id = uuid::Uuid::new_v4().to_string();
        self.message_service.create(
            assistant_message_id.clone(),
            chat_id.clone(),
            "assistant".to_string(),
            String::new(),
            Some(user_timestamp + 1),
            None,
            None,
            None,
        )?;

        MessageEmitter::new(app.clone()).emit_message_started(
            chat_id.clone(),
            None,
            user_message_id.clone(),
            assistant_message_id.clone(),
        )?;

        let turn_request = MessageTurnRequest {
            chat_id: chat_id.clone(),
            workspace_id: workspace_id.clone(),
            user_message_id: user_message_id.clone(),
            user_content: content.clone(),
            user_metadata: metadata,
            user_files: processed_files,
            assistant_message_id: assistant_message_id.clone(),
            history_before_user: existing_messages,
            model,
            reasoning_effort,
            llm_connection,
            workspace_settings: workspace_settings.clone(),
            agent_id: chat.agent_id.clone(),
        };

        Ok(PreparedTurn {
            turn_id,
            user_message_id,
            assistant_message_id,
            turn_request,
        })
    }

    pub async fn edit_and_resend_message(
        &self,
        chat_id: String,
        message_id: String,
        new_content: String,
        new_files: Option<Vec<String>>,
        metadata: Option<String>,
        selected_model: Option<String>,
        reasoning_effort: Option<String>,
        llm_connection_id: Option<String>,
        app: AppHandle,
    ) -> Result<StartTurnResult, AppError> {
        let processed_new_files = self.harness_factory.process_incoming_files(&app, new_files)?;

        if self.message_service.get_by_id(&message_id)?.is_none() {
            self.message_service
                .delete_messages_after(chat_id.clone(), message_id)?;
            return self
                .send_message(
                    chat_id,
                    new_content,
                    processed_new_files,
                    metadata,
                    selected_model,
                    reasoning_effort,
                    llm_connection_id,
                    app,
                )
                .await;
        }

        self.conversation_manager.cancel_turn(&chat_id).await?;

        self.message_service
            .delete_messages_after(chat_id.clone(), message_id.clone())?;
        self.message_service.delete(message_id)?;

        self.send_message(
            chat_id,
            new_content,
            processed_new_files,
            metadata,
            selected_model,
            reasoning_effort,
            llm_connection_id,
            app,
        )
        .await
    }

    pub fn generate_chat_title(
        &self,
        app: AppHandle,
        chat_id: String,
        user_content: String,
        model: Option<String>,
        llm_connection_id: Option<String>,
    ) {
        self.harness_factory.spawn_if_first_user_message(
            app,
            chat_id,
            user_content,
            model,
            llm_connection_id,
        );
    }
}
