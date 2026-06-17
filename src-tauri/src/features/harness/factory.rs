use crate::error::AppError;
use crate::features::agent::manager::AgentManager;
use crate::features::chat::repository::ChatRepository;
use crate::features::harness::adapters::incoming_files::{merge_file_metadata, process_incoming_files};
use crate::features::harness::adapters::title::TitleGenerator;
use crate::features::harness::adapters::files::DefaultFileContentLoader;
use crate::features::harness::adapters::hooks_tauri::TauriHarnessHooks;
use crate::features::harness::adapters::llm::LlmServiceAdapter;
use crate::features::harness::adapters::prompt::{NexoMessageBuilder, NexoPromptProvider};
use crate::features::harness::adapters::session::SqliteSessionStore;
use crate::features::harness::session::AgentSession;
use crate::features::harness::traits::{HarnessDeps, PromptProvider};
use crate::features::harness::types::{HarnessMessages, MessageBuildContext, MessageTurnRequest, TurnOutput};
use crate::features::llm_connection::LLMConnectionService;
use crate::features::message::MessageService;
use crate::features::skill::SkillService;
use crate::features::tool::service::ToolService;
use crate::features::usage::UsageService;
use crate::features::workspace::settings::WorkspaceSettingsService;
use crate::services::LLMService;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::broadcast;

pub struct HarnessFactory {
    deps: Arc<HarnessDeps>,
    title_generator: Arc<TitleGenerator>,
}

impl HarnessFactory {
    pub fn new(
        llm_service: Arc<LLMService>,
        message_service: Arc<MessageService>,
        chat_repository: Arc<dyn ChatRepository>,
        tool_service: Arc<ToolService>,
        usage_service: Arc<UsageService>,
        agent_manager: Arc<AgentManager>,
        skill_service: Arc<SkillService>,
        llm_connection_service: Arc<LLMConnectionService>,
        workspace_settings_service: Arc<WorkspaceSettingsService>,
    ) -> Self {
        let prompt_provider: Arc<dyn PromptProvider> =
            Arc::new(NexoPromptProvider::new(skill_service));
        let file_loader = Arc::new(DefaultFileContentLoader);
        let message_builder = Arc::new(NexoMessageBuilder::new(
            prompt_provider.clone(),
            file_loader,
        ));
        let session_store = Arc::new(SqliteSessionStore::new(
            message_service.clone(),
            chat_repository.clone(),
        ));
        let llm_client = Arc::new(LlmServiceAdapter::new(llm_service.clone()));
        let hooks = Arc::new(TauriHarnessHooks::new(usage_service));

        let deps = Arc::new(HarnessDeps {
            prompt_provider,
            message_builder,
            session_store,
            llm_client: llm_client.clone(),
            hooks,
            tool_service,
            agent_manager,
            message_service: message_service.clone(),
        });

        let title_generator = Arc::new(TitleGenerator::new(
            llm_client,
            chat_repository,
            message_service,
            llm_connection_service,
            workspace_settings_service,
        ));

        Self {
            deps,
            title_generator,
        }
    }

    pub fn session(&self) -> AgentSession {
        AgentSession::new(self.deps.clone())
    }

    pub fn build_messages(
        &self,
        ctx: &MessageBuildContext<'_>,
    ) -> Result<HarnessMessages, AppError> {
        self.deps.message_builder.build_messages(ctx)
    }

    pub fn process_incoming_files(
        &self,
        app: &AppHandle,
        files: Option<Vec<String>>,
    ) -> Result<Option<Vec<String>>, AppError> {
        process_incoming_files(app, files)
    }

    pub fn merge_file_metadata(
        &self,
        metadata: Option<&str>,
        processed_files: Option<&[String]>,
    ) -> Option<String> {
        merge_file_metadata(metadata, processed_files)
    }

    pub async fn process_message_turn(
        &self,
        request: MessageTurnRequest,
        app: AppHandle,
        cancellation_rx: broadcast::Receiver<()>,
    ) -> Result<TurnOutput, AppError> {
        self.session()
            .run_message_turn(request, app, cancellation_rx)
            .await
    }

    pub fn spawn_title_generation(
        self: &Arc<Self>,
        app: AppHandle,
        chat_id: String,
        user_content: String,
        model: Option<String>,
        llm_connection_id: Option<String>,
    ) {
        self.title_generator.clone().spawn_title_generation(
            app,
            chat_id,
            user_content,
            model,
            llm_connection_id,
        );
    }

    pub fn spawn_if_first_user_message(
        self: &Arc<Self>,
        app: AppHandle,
        chat_id: String,
        user_content: String,
        model: Option<String>,
        llm_connection_id: Option<String>,
    ) {
        self.title_generator.clone().spawn_if_first_user_message(
            app,
            chat_id,
            user_content,
            model,
            llm_connection_id,
        );
    }

    pub async fn generate_chat_title(
        &self,
        app: AppHandle,
        chat_id: String,
        user_content: String,
        model: Option<String>,
        llm_connection_id: Option<String>,
    ) -> Result<(), AppError> {
        self.title_generator
            .generate_title(app, chat_id, user_content, model, llm_connection_id)
            .await
    }
}
