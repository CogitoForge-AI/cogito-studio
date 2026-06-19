/**
 * Tauri Command Names
 * Auto-generated from Rust constants in src-tauri/src/constants/commands.rs
 * DO NOT EDIT MANUALLY - Update the Rust file instead
 */

export const TauriCommands = {
  // Basic commands
  GREET: 'greet',

  // Workspace commands
  CREATE_WORKSPACE: 'create_workspace',
  GET_WORKSPACES: 'get_workspaces',
  UPDATE_WORKSPACE: 'update_workspace',
  DELETE_WORKSPACE: 'delete_workspace',

  // Chat commands
  CREATE_CHAT: 'create_chat',
  GET_CHATS: 'get_chats',
  UPDATE_CHAT: 'update_chat',
  DELETE_CHAT: 'delete_chat',
  DELETE_ALL_CHATS_BY_WORKSPACE: 'delete_all_chats_by_workspace',
  SEND_MESSAGE: 'send_message',
  EDIT_AND_RESEND_MESSAGE: 'edit_and_resend_message',
  RESPOND_TOOL_PERMISSION: 'respond_tool_permission',
  RESPOND_USER_QUESTION: 'respond_user_question',
  GENERATE_CHAT_TITLE: 'generate_chat_title',
  GET_OR_CREATE_SPECIALIST_SESSION: 'get_or_create_specialist_session',
  GET_CONVERSATION_STATE: 'get_conversation_state',
  GET_ACTIVE_CONVERSATIONS: 'get_active_conversations',

  // Chat Input Settings commands
  GET_CHAT_INPUT_SETTINGS: 'get_chat_input_settings',
  SAVE_CHAT_INPUT_SETTINGS: 'save_chat_input_settings',

  // Message commands
  CREATE_MESSAGE: 'create_message',
  GET_MESSAGES: 'get_messages',
  UPDATE_MESSAGE: 'update_message',
  DELETE_MESSAGE: 'delete_message',
  DELETE_MESSAGES_AFTER: 'delete_messages_after',
  CANCEL_MESSAGE: 'cancel_message',

  // Workspace Settings commands
  SAVE_WORKSPACE_SETTINGS: 'save_workspace_settings',
  GET_WORKSPACE_SETTINGS: 'get_workspace_settings',

  // LLM Connection commands
  CREATE_LLM_CONNECTION: 'create_llm_connection',
  GET_LLM_CONNECTIONS: 'get_llm_connections',
  UPDATE_LLM_CONNECTION: 'update_llm_connection',
  DELETE_LLM_CONNECTION: 'delete_llm_connection',
  TEST_LLM_CONNECTION: 'test_llm_connection',

  // MCP Server Connection commands
  CREATE_MCP_SERVER_CONNECTION: 'create_mcp_server_connection',
  GET_MCP_SERVER_CONNECTIONS: 'get_mcp_server_connections',
  UPDATE_MCP_SERVER_CONNECTION: 'update_mcp_server_connection',
  DELETE_MCP_SERVER_CONNECTION: 'delete_mcp_server_connection',
  UPDATE_MCP_SERVER_STATUS: 'update_mcp_server_status',

  // App Settings commands
  SAVE_APP_SETTING: 'save_app_setting',
  GET_APP_SETTING: 'get_app_setting',
  GET_ALL_APP_SETTINGS: 'get_all_app_settings',

  // Web Search commands
  TEST_WEB_SEARCH_CONNECTION: 'test_web_search_connection',

  // MCP Tools commands
  TEST_MCP_CONNECTION_AND_FETCH_TOOLS: 'test_mcp_connection_and_fetch_tools',
  CONNECT_MCP_SERVER_AND_FETCH_TOOLS: 'connect_mcp_server_and_fetch_tools',
  GET_MCP_CLIENT: 'get_mcp_client',
  CALL_MCP_TOOL: 'call_mcp_tool',
  DISCONNECT_MCP_CLIENT: 'disconnect_mcp_client',
  GET_ACTIVE_TOOLS_FOR_WORKSPACE: 'get_active_tools_for_workspace',

  // Python commands
  GET_PYTHON_RUNTIMES_STATUS: 'get_python_runtimes_status',
  INSTALL_PYTHON_RUNTIME: 'install_python_runtime',
  UNINSTALL_PYTHON_RUNTIME: 'uninstall_python_runtime',
  EXECUTE_PYTHON_CODE: 'execute_python_code',

  // Node commands
  GET_NODE_RUNTIMES_STATUS: 'get_node_runtimes_status',
  INSTALL_NODE_RUNTIME: 'install_node_runtime',
  UNINSTALL_NODE_RUNTIME: 'uninstall_node_runtime',

  // Skill commands
  GET_ALL_SKILLS: 'get_all_skills',
  LOAD_SKILL: 'load_skill',
  OPEN_SKILLS_FOLDER: 'open_skills_folder',
  IMPORT_SKILL_FROM_GITHUB: 'import_skill_from_github',
  DELETE_SKILL: 'delete_skill',

  // Note commands
  CREATE_NOTE: 'create_note',
  GET_NOTES: 'get_notes',
  UPDATE_NOTE: 'update_note',
  DELETE_NOTE: 'delete_note',

  // Artifact commands
  GET_ARTIFACTS: 'get_artifacts',
  DELETE_ARTIFACT: 'delete_artifact',

  // Browser commands
  BROWSER_CREATE_TAB: 'browser_create_tab',
  BROWSER_DESTROY_TAB: 'browser_destroy_tab',
  BROWSER_LIST_TABS: 'browser_list_tabs',
  BROWSER_GET_ACTIVE_TAB: 'browser_get_active_tab',
  BROWSER_SET_ACTIVE_TAB: 'browser_set_active_tab',
  BROWSER_CREATE_FENCE_TAB: 'browser_create_fence_tab',
  BROWSER_RELEASE_FENCE_TAB: 'browser_release_fence_tab',
  BROWSER_RELEASE_FENCES_FOR_CHAT: 'browser_release_fences_for_chat',
  BROWSER_SYNC_BOUNDS: 'browser_sync_bounds',
  BROWSER_RELEASE_VIEWPORT: 'browser_release_viewport',
  BROWSER_NAVIGATE: 'browser_navigate',
  BROWSER_GET_NAVIGATION_STATE: 'browser_get_navigation_state',
  BROWSER_GO_BACK: 'browser_go_back',
  BROWSER_GO_FORWARD: 'browser_go_forward',
  BROWSER_RELOAD: 'browser_reload',
} as const;

export type TauriCommand = (typeof TauriCommands)[keyof typeof TauriCommands];
