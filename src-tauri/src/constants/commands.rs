use ts_rs::TS;

/// Tauri command names - Single source of truth
/// TypeScript bindings will be auto-generated from this struct
#[derive(TS)]
#[ts(export, export_to = "../src/bindings/")]
pub struct TauriCommands;

impl TauriCommands {
    // Workspace commands
    pub const CREATE_WORKSPACE: &'static str = "create_workspace";
    pub const GET_WORKSPACES: &'static str = "get_workspaces";
    pub const UPDATE_WORKSPACE: &'static str = "update_workspace";
    pub const DELETE_WORKSPACE: &'static str = "delete_workspace";

    // Chat commands
    pub const CREATE_CHAT: &'static str = "create_chat";
    pub const GET_CHATS: &'static str = "get_chats";
    pub const UPDATE_CHAT: &'static str = "update_chat";
    pub const DELETE_CHAT: &'static str = "delete_chat";
    pub const DELETE_ALL_CHATS_BY_WORKSPACE: &'static str = "delete_all_chats_by_workspace";
    pub const SEND_MESSAGE: &'static str = "send_message";
    pub const EDIT_AND_RESEND_MESSAGE: &'static str = "edit_and_resend_message";
    pub const RESPOND_TOOL_PERMISSION: &'static str = "respond_tool_permission";
    pub const RESPOND_USER_QUESTION: &'static str = "respond_user_question";
    pub const GENERATE_CHAT_TITLE: &'static str = "generate_chat_title";
    pub const GET_OR_CREATE_SPECIALIST_SESSION: &'static str = "get_or_create_specialist_session";
    pub const GET_CONVERSATION_STATE: &'static str = "get_conversation_state";
    pub const GET_ACTIVE_CONVERSATIONS: &'static str = "get_active_conversations";

    // Message commands
    pub const CREATE_MESSAGE: &'static str = "create_message";
    pub const GET_MESSAGES: &'static str = "get_messages";
    pub const UPDATE_MESSAGE: &'static str = "update_message";
    pub const DELETE_MESSAGE: &'static str = "delete_message";
    pub const DELETE_MESSAGES_AFTER: &'static str = "delete_messages_after";
    pub const CANCEL_MESSAGE: &'static str = "cancel_message";

    // MCP Server commands
    pub const CREATE_MCP_SERVER: &'static str = "create_mcp_server";
    pub const GET_MCP_SERVERS: &'static str = "get_mcp_servers";
    pub const UPDATE_MCP_SERVER: &'static str = "update_mcp_server";
    pub const DELETE_MCP_SERVER: &'static str = "delete_mcp_server";

    // MCP Connection commands
    pub const CREATE_MCP_SERVER_CONNECTION: &'static str = "create_mcp_server_connection";
    pub const GET_MCP_SERVER_CONNECTIONS: &'static str = "get_mcp_server_connections";
    pub const UPDATE_MCP_SERVER_CONNECTION: &'static str = "update_mcp_server_connection";
    pub const DELETE_MCP_SERVER_CONNECTION: &'static str = "delete_mcp_server_connection";
    pub const UPDATE_MCP_SERVER_STATUS: &'static str = "update_mcp_server_status";

    // App Settings commands
    pub const SAVE_APP_SETTING: &'static str = "save_app_setting";
    pub const GET_APP_SETTING: &'static str = "get_app_setting";
    pub const GET_ALL_APP_SETTINGS: &'static str = "get_all_app_settings";

    // Web Search commands
    pub const TEST_WEB_SEARCH_CONNECTION: &'static str = "test_web_search_connection";

    // MCP Tools commands
    pub const TEST_MCP_CONNECTION_AND_FETCH_TOOLS: &'static str =
        "test_mcp_connection_and_fetch_tools";
    pub const CONNECT_MCP_SERVER_AND_FETCH_TOOLS: &'static str =
        "connect_mcp_server_and_fetch_tools";
    pub const GET_MCP_CLIENT: &'static str = "get_mcp_client";
    pub const CALL_MCP_TOOL: &'static str = "call_mcp_tool";
    pub const DISCONNECT_MCP_CLIENT: &'static str = "disconnect_mcp_client";
    pub const GET_ACTIVE_TOOLS_FOR_WORKSPACE: &'static str = "get_active_tools_for_workspace";

    // Python commands
    pub const GET_PYTHON_RUNTIMES_STATUS: &'static str = "get_python_runtimes_status";
    pub const INSTALL_PYTHON_RUNTIME: &'static str = "install_python_runtime";
    pub const UNINSTALL_PYTHON_RUNTIME: &'static str = "uninstall_python_runtime";
    pub const EXECUTE_PYTHON_CODE: &'static str = "execute_python_code";

    // Node commands
    pub const GET_NODE_RUNTIMES_STATUS: &'static str = "get_node_runtimes_status";
    pub const INSTALL_NODE_RUNTIME: &'static str = "install_node_runtime";
    pub const UNINSTALL_NODE_RUNTIME: &'static str = "uninstall_node_runtime";

    // Skill commands
    pub const GET_ALL_SKILLS: &'static str = "get_all_skills";
    pub const LOAD_SKILL: &'static str = "load_skill";
    pub const OPEN_SKILLS_FOLDER: &'static str = "open_skills_folder";
    pub const IMPORT_SKILL_FROM_GITHUB: &'static str = "import_skill_from_github";
    pub const DELETE_SKILL: &'static str = "delete_skill";

    // Note commands
    pub const CREATE_NOTE: &'static str = "create_note";
    pub const GET_NOTES: &'static str = "get_notes";
    pub const UPDATE_NOTE: &'static str = "update_note";
    pub const DELETE_NOTE: &'static str = "delete_note";

    // Artifact commands
    pub const GET_ARTIFACTS: &'static str = "get_artifacts";
    pub const DELETE_ARTIFACT: &'static str = "delete_artifact";

    // Browser commands
    pub const BROWSER_CREATE_TAB: &'static str = "browser_create_tab";
    pub const BROWSER_DESTROY_TAB: &'static str = "browser_destroy_tab";
    pub const BROWSER_LIST_TABS: &'static str = "browser_list_tabs";
    pub const BROWSER_GET_ACTIVE_TAB: &'static str = "browser_get_active_tab";
    pub const BROWSER_SET_ACTIVE_TAB: &'static str = "browser_set_active_tab";
    pub const BROWSER_CREATE_FENCE_TAB: &'static str = "browser_create_fence_tab";
    pub const BROWSER_RELEASE_FENCE_TAB: &'static str = "browser_release_fence_tab";
    pub const BROWSER_RELEASE_FENCES_FOR_CHAT: &'static str = "browser_release_fences_for_chat";
    pub const BROWSER_SYNC_BOUNDS: &'static str = "browser_sync_bounds";
    pub const BROWSER_RELEASE_VIEWPORT: &'static str = "browser_release_viewport";
    pub const BROWSER_NAVIGATE: &'static str = "browser_navigate";
    pub const BROWSER_GET_NAVIGATION_STATE: &'static str = "browser_get_navigation_state";
    pub const BROWSER_GO_BACK: &'static str = "browser_go_back";
    pub const BROWSER_GO_FORWARD: &'static str = "browser_go_forward";
    pub const BROWSER_RELOAD: &'static str = "browser_reload";
}
