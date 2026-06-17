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

    // Prompt commands
    pub const CREATE_PROMPT: &'static str = "create_prompt";
    pub const GET_PROMPTS: &'static str = "get_prompts";
    pub const UPDATE_PROMPT: &'static str = "update_prompt";
    pub const DELETE_PROMPT: &'static str = "delete_prompt";

    // Hub commands
    pub const FETCH_HUB_PROMPTS: &'static str = "fetch_hub_prompts";
    pub const FETCH_PROMPT_TEMPLATE: &'static str = "fetch_prompt_template";
    pub const INSTALL_PROMPT_FROM_HUB: &'static str = "install_prompt_from_hub";
    pub const FETCH_HUB_MCP_SERVERS: &'static str = "fetch_hub_mcp_servers";
    pub const INSTALL_MCP_SERVER_FROM_HUB: &'static str = "install_mcp_server_from_hub";
    pub const REFRESH_HUB_INDEX: &'static str = "refresh_hub_index";

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

    // Agent commands
    pub const INSTALL_AGENT: &'static str = "install_agent";
    pub const GET_INSTALLED_AGENTS: &'static str = "get_installed_agents";
    pub const DELETE_AGENT: &'static str = "delete_agent";
    pub const GET_AGENT_INFO: &'static str = "get_agent_info";
    pub const UPDATE_AGENT: &'static str = "update_agent";
    pub const GET_OR_CREATE_SPECIALIST_SESSION: &'static str = "get_or_create_specialist_session";

    // Note commands
    pub const CREATE_NOTE: &'static str = "create_note";
    pub const GET_NOTES: &'static str = "get_notes";
    pub const UPDATE_NOTE: &'static str = "update_note";
    pub const DELETE_NOTE: &'static str = "delete_note";
}
