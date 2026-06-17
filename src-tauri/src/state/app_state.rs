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
use crate::features::prompt::{PromptRepository, PromptService, SqlitePromptRepository};

use crate::features::notes::{
    repository::{NoteRepository, SqliteNoteRepository},
    service::NoteService,
};
use crate::features::skill::SkillService;
use crate::features::tool::{mcp_refresh::MCPToolRefreshService, service::ToolService};
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
    // Database state (for initialization)
    #[allow(dead_code)]
    pub db_state: Arc<Mutex<Option<Connection>>>,

    // Services (injected dependencies)
    pub workspace_feature: Arc<WorkspaceFeature>,
    pub chat_service: Arc<ChatService>,
    pub message_service: Arc<MessageService>,
    pub chat_input_settings_service: Arc<ChatInputSettingsService>,
    pub llm_connection_service: Arc<LLMConnectionService>,
    pub mcp_connection_service: Arc<MCPConnectionService>,
    pub usage_service: Arc<UsageService>,
    #[allow(dead_code)]
    pub tool_service: Arc<ToolService>,
    pub app_settings_service: Arc<AppSettingsService>,
    pub prompt_service: Arc<PromptService>,
    pub note_service: Arc<NoteService>,

    // Tool permission state: message_id -> oneshot sender for approval response
    pub pending_tool_permissions: Arc<Mutex<HashMap<String, oneshot::Sender<PermissionDecision>>>>,

    // Ask user tool: tool_call_id -> pending question request
    pub pending_user_questions:
        Arc<Mutex<HashMap<String, crate::state::user_question::PendingUserQuestion>>>,

    // Agent Manager
    pub agent_manager: Arc<crate::features::agent::manager::AgentManager>,

    // Skill Service
    pub skill_service: Arc<SkillService>,
}

impl AppState {
    pub fn new(app: Arc<AppHandle>) -> Result<Self, crate::error::AppError> {
        // Initialize database if needed
        let db_state = Arc::new(Mutex::new(None));
        {
            let mut db_guard = db_state.lock().map_err(|e| {
                crate::error::AppError::Generic(format!("Failed to acquire database lock: {e}"))
            })?;
            if db_guard.is_none() {
                *db_guard = Some(crate::db::init_db(&app)?);
            }
        }

        // Create repositories
        let workspace_repo: Arc<dyn WorkspaceRepository> =
            Arc::new(SqliteWorkspaceRepository::new(app.clone()));
        let chat_repo: Arc<dyn ChatRepository> = Arc::new(SqliteChatRepository::new(app.clone()));
        let message_repo: Arc<dyn MessageRepository> =
            Arc::new(SqliteMessageRepository::new(app.clone()));
        let workspace_settings_repo: Arc<dyn WorkspaceSettingsRepository> =
            Arc::new(SqliteWorkspaceSettingsRepository::new(app.clone()));

        let app_settings_repo: Arc<dyn AppSettingsRepository> =
            Arc::new(SqliteAppSettingsRepository::new(app.clone()));
        let prompt_repo: Arc<dyn PromptRepository> =
            Arc::new(SqlitePromptRepository::new(app.clone()));
        let usage_repo: Arc<dyn UsageRepository> =
            Arc::new(SqliteUsageRepository::new(app.clone()));
        let chat_input_settings_repo: Arc<dyn ChatInputSettingsRepository> =
            Arc::new(SqliteChatInputSettingsRepository::new(app.clone()));

        // Initialize Agent Manager first as it's needed by ChatService
        let agent_manager = Arc::new(crate::features::agent::manager::AgentManager::new(
            (*app)
                .path()
                .app_data_dir()
                .map_err(crate::error::AppError::Tauri)?,
            crate::features::sandbox::SandboxService::bundled_uv_path(&app)?,
        ));

        // Create services
        let workspace_service = Arc::new(WorkspaceService::new(workspace_repo));
        workspace_service.ensure_default_workspace()?;

        let message_service = Arc::new(MessageService::new(message_repo));
        let workspace_settings_service =
            Arc::new(WorkspaceSettingsService::new(workspace_settings_repo));

        // Feature: Workspace
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
        let tool_service = Arc::new(ToolService::new(
            (*app).clone(),
            mcp_connection_service.clone(),
            workspace_settings_service.clone(),
        ));

        let skill_service = Arc::new(SkillService::new((*app).clone()));

        let harness_factory = Arc::new(HarnessFactory::new(
            llm_service.clone(),
            message_service.clone(),
            chat_repo.clone(),
            tool_service.clone(),
            usage_service.clone(),
            agent_manager.clone(),
            skill_service.clone(),
            llm_connection_service.clone(),
            workspace_settings_service.clone(),
        ));

        let chat_service = Arc::new(ChatService::new(
            chat_repo,
            message_service.clone(),
            workspace_settings_service,
            llm_connection_service.clone(),
            agent_manager.clone(),
            harness_factory,
        ));

        let app_settings_service = Arc::new(AppSettingsService::new(app_settings_repo));
        let prompt_service = Arc::new(PromptService::new(prompt_repo));
        let chat_input_settings_service =
            Arc::new(ChatInputSettingsService::new(chat_input_settings_repo));

        let note_repo: Arc<dyn NoteRepository> = Arc::new(SqliteNoteRepository::new(app.clone()));
        let note_service = Arc::new(NoteService::new(note_repo));

        // Create and start MCP tool refresh service
        let mcp_tool_refresh_service = Arc::new(MCPToolRefreshService::new(
            (*app).clone(),
            mcp_connection_repo,
        ));

        // Start background refresh job (runs every 5 minutes)
        mcp_tool_refresh_service.start_background_refresh();

        Ok(Self {
            db_state,
            workspace_feature,
            chat_service,
            message_service,
            chat_input_settings_service,
            llm_connection_service,
            mcp_connection_service,
            usage_service,
            tool_service,
            app_settings_service,
            prompt_service,
            note_service,
            pending_tool_permissions: Arc::new(Mutex::new(HashMap::new())),
            pending_user_questions: Arc::new(Mutex::new(HashMap::new())),
            agent_manager,
            skill_service,
        })
    }
}
