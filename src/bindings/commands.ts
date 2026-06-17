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

  // Prompt commands
  CREATE_PROMPT: 'create_prompt',
  GET_PROMPTS: 'get_prompts',
  UPDATE_PROMPT: 'update_prompt',
  DELETE_PROMPT: 'delete_prompt',

  // Hub commands
  FETCH_HUB_PROMPTS: 'fetch_hub_prompts',
  FETCH_PROMPT_TEMPLATE: 'fetch_prompt_template',
  INSTALL_PROMPT_FROM_HUB: 'install_prompt_from_hub',
  FETCH_HUB_MCP_SERVERS: 'fetch_hub_mcp_servers',
  INSTALL_MCP_SERVER_FROM_HUB: 'install_mcp_server_from_hub',
  REFRESH_HUB_INDEX: 'refresh_hub_index',
  FETCH_HUB_AGENTS: 'fetch_hub_agents',
  INSTALL_AGENT_FROM_HUB: 'install_agent_from_hub',

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

  // Agent commands
  INSTALL_AGENT: 'install_agent',
  GET_INSTALLED_AGENTS: 'get_installed_agents',
  DELETE_AGENT: 'delete_agent',
  GET_AGENT_INFO: 'get_agent_info',
  UPDATE_AGENT: 'update_agent',
  GET_OR_CREATE_SPECIALIST_SESSION: 'get_or_create_specialist_session',

  // Skill commands
  GET_ALL_SKILLS: 'get_all_skills',
  SYNC_SKILLS: 'sync_skills',
  LOAD_SKILL: 'load_skill',
  IMPORT_SKILL: 'import_skill',
  DELETE_SKILL: 'delete_skill',
  // Note commands
  CREATE_NOTE: 'create_note',
  GET_NOTES: 'get_notes',
  UPDATE_NOTE: 'update_note',
  DELETE_NOTE: 'delete_note',
} as const;

export type TauriCommand = (typeof TauriCommands)[keyof typeof TauriCommands];
