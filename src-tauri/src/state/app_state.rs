use crate::features::app_settings::{
    repository::{AppSettingsRepository, SqliteAppSettingsRepository},
    service::AppSettingsService,
};
use crate::features::chat::input_settings::{
    ChatInputSettingsRepository, ChatInputSettingsService, SqliteChatInputSettingsRepository,
};
use crate::features::chat::{ChatRepository, ChatService, SqliteChatRepository};
use crate::features::llm_connection::{
    LLMConnectionRepository, LLMConnectionService, SqliteLLMConnectionRepository,
};
use crate::features::mcp_connection::{
    MCPConnectionRepository, MCPConnectionService, SqliteMCPConnectionRepository,
};
use crate::features::message::{MessageRepository, MessageService, SqliteMessageRepository};

use crate::features::notes::{
    repository::{NoteRepository, SqliteNoteRepository},
    service::NoteService,
};
use crate::features::artifacts::{
    repository::{ArtifactRepository, SqliteArtifactRepository},
    service::ArtifactService,
};
use crate::features::browser::BrowserService;
use crate::features::conversation::{
    manager::ConversationJobManager, stream_persist::StreamPersistDebouncer,
};
use crate::features::skill::SkillService;
use crate::features::tool::{mcp::MCPToolRefreshService, core::ToolDeps};
use crate::features::harness::HarnessFactory;
use crate::features::usage::{SqliteUsageRepository, UsageRepository, UsageService};
use crate::features::workspace::{
    management::{SqliteWorkspaceRepository, WorkspaceRepository, WorkspaceService},
    settings::{
        SqliteWorkspaceSettingsRepository, WorkspaceSettingsRepository, WorkspaceSettingsService,
    },
    WorkspaceFeature,
};

use crate::services::LLMService;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
use tokio::sync::oneshot;

#[derive(Debug)]
pub struct PermissionDecision {
    pub approved: bool,
    pub allowed_tool_ids: Vec<String>,
}

pub struct AppState {
    #[allow(dead_code)]
    pub db_state: Arc<Mutex<Option<Connection>>>,

    pub workspace_feature: Arc<WorkspaceFeature>,
    pub chat_service: Arc<ChatService>,
    pub conversation_manager: Arc<ConversationJobManager>,
    pub stream_persist: Arc<StreamPersistDebouncer>,
    pub message_service: Arc<MessageService>,
    pub chat_input_settings_service: Arc<ChatInputSettingsService>,
    pub llm_connection_service: Arc<LLMConnectionService>,
    pub mcp_connection_service: Arc<MCPConnectionService>,
    pub usage_service: Arc<UsageService>,
    #[allow(dead_code)]
    pub tool_deps: Arc<ToolDeps>,
    pub app_settings_service: Arc<AppSettingsService>,
    pub note_service: Arc<NoteService>,
    pub artifact_service: Arc<ArtifactService>,
    pub browser_service: Arc<BrowserService>,

    pub pending_tool_permissions: Arc<Mutex<HashMap<String, oneshot::Sender<PermissionDecision>>>>,
    pub pending_user_questions:
        Arc<Mutex<HashMap<String, crate::state::user_question::PendingUserQuestion>>>,

    pub skill_service: Arc<SkillService>,
    pub skill_sync_coordinator: Arc<crate::features::skill::SkillSyncCoordinator>,
    pub app_handle: AppHandle,
}

impl AppState {
    pub fn new(app: Arc<AppHandle>) -> Result<Self, crate::error::AppError> {
        let db_state = Arc::new(Mutex::new(None));
        {
            let mut db_guard = db_state.lock().map_err(|e| {
                crate::error::AppError::Generic(format!("Failed to acquire database lock: {e}"))
            })?;
            if db_guard.is_none() {
                *db_guard = Some(crate::db::init_db(&app)?);
            }
        }

        let workspace_repo: Arc<dyn WorkspaceRepository> =
            Arc::new(SqliteWorkspaceRepository::new(app.clone()));
        let chat_repo: Arc<dyn ChatRepository> = Arc::new(SqliteChatRepository::new(app.clone()));
        let message_repo: Arc<dyn MessageRepository> =
            Arc::new(SqliteMessageRepository::new(app.clone()));
        let workspace_settings_repo: Arc<dyn WorkspaceSettingsRepository> =
            Arc::new(SqliteWorkspaceSettingsRepository::new(app.clone()));

        let app_settings_repo: Arc<dyn AppSettingsRepository> =
            Arc::new(SqliteAppSettingsRepository::new(app.clone()));
        let usage_repo: Arc<dyn UsageRepository> =
            Arc::new(SqliteUsageRepository::new(app.clone()));
        let chat_input_settings_repo: Arc<dyn ChatInputSettingsRepository> =
            Arc::new(SqliteChatInputSettingsRepository::new(app.clone()));

        let workspace_service = Arc::new(WorkspaceService::new(workspace_repo));
        workspace_service.ensure_default_workspace()?;

        let message_service = Arc::new(MessageService::new(message_repo));
        let workspace_settings_service =
            Arc::new(WorkspaceSettingsService::new(workspace_settings_repo));

        let workspace_feature = Arc::new(WorkspaceFeature::new(
            workspace_service,
            workspace_settings_service.clone(),
        ));

        let llm_connection_repo: Arc<dyn LLMConnectionRepository> =
            Arc::new(SqliteLLMConnectionRepository::new(app.clone()));
        let llm_connection_service = Arc::new(LLMConnectionService::new(llm_connection_repo));

        let llm_service = Arc::new(LLMService::new());
        let usage_service = Arc::new(UsageService::new(usage_repo));
        let mcp_connection_repo: Arc<dyn MCPConnectionRepository> =
            Arc::new(SqliteMCPConnectionRepository::new(app.clone()));
        let mcp_connection_service =
            Arc::new(MCPConnectionService::new(mcp_connection_repo.clone()));

        let app_settings_service = Arc::new(AppSettingsService::new(app_settings_repo));

        let artifact_repo: Arc<dyn ArtifactRepository> =
            Arc::new(SqliteArtifactRepository::new(app.clone()));
        let artifact_service = Arc::new(ArtifactService::new(artifact_repo, app.clone()));
        let browser_factory = Arc::new(crate::features::browser::WebviewFactory::new(app.clone()));
        let browser_service = Arc::new(BrowserService::new(browser_factory));

        let tool_deps = Arc::new(ToolDeps::new(
            (*app).clone(),
            mcp_connection_service.clone(),
            workspace_settings_service.clone(),
            app_settings_service.clone(),
            artifact_service.clone(),
            browser_service.clone(),
        ));

        let skill_service = Arc::new(SkillService::new((*app).clone()));
        let skill_sync_coordinator = Arc::new(crate::features::skill::SkillSyncCoordinator::new(
            skill_service.clone(),
            (*app).clone(),
        ));

        let harness_factory = Arc::new(HarnessFactory::new(
            llm_service.clone(),
            message_service.clone(),
            chat_repo.clone(),
            tool_deps.clone(),
            usage_service.clone(),
            skill_service.clone(),
            llm_connection_service.clone(),
            workspace_settings_service.clone(),
        ));

        let conversation_manager = Arc::new(ConversationJobManager::new(harness_factory.clone()));
        let stream_persist = StreamPersistDebouncer::new(message_service.clone());

        let chat_service = Arc::new(ChatService::new(
            chat_repo,
            message_service.clone(),
            workspace_settings_service,
            llm_connection_service.clone(),
            harness_factory,
            artifact_service.clone(),
            conversation_manager.clone(),
        ));

        let chat_input_settings_service =
            Arc::new(ChatInputSettingsService::new(chat_input_settings_repo));

        let note_repo: Arc<dyn NoteRepository> = Arc::new(SqliteNoteRepository::new(app.clone()));
        let note_service = Arc::new(NoteService::new(note_repo));

        let mcp_tool_refresh_service = Arc::new(MCPToolRefreshService::new(
            (*app).clone(),
            mcp_connection_repo,
        ));
        mcp_tool_refresh_service.start_background_refresh();

        Ok(Self {
            db_state,
            workspace_feature,
            chat_service,
            conversation_manager,
            stream_persist,
            message_service,
            chat_input_settings_service,
            llm_connection_service,
            mcp_connection_service,
            usage_service,
            tool_deps,
            app_settings_service,
            note_service,
            artifact_service,
            browser_service,
            pending_tool_permissions: Arc::new(Mutex::new(HashMap::new())),
            pending_user_questions: Arc::new(Mutex::new(HashMap::new())),
            skill_service,
            skill_sync_coordinator,
            app_handle: (*app).clone(),
        })
    }
}
