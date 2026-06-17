use super::ask_user;
use super::internal::InternalToolService;
use super::mcp_client::MCPClientService;
use crate::error::AppError;
use crate::features::harness::tool_execution_context::ToolExecutionContext;
use crate::features::mcp_connection::MCPConnectionService;
use crate::features::tool::models::{MCPTool, UnifiedToolInfo};
use crate::features::workspace::settings::WorkspaceSettingsService;
use crate::models::llm_types::ChatCompletionTool;
use serde_json;
use std::sync::Arc;
use tauri::AppHandle;

pub struct ToolService {
    app: AppHandle,
    mcp_connection_service: Arc<MCPConnectionService>,
    workspace_settings_service: Arc<WorkspaceSettingsService>,
}

impl ToolService {
    pub const fn new(
        app: AppHandle,
        mcp_connection_service: Arc<MCPConnectionService>,
        workspace_settings_service: Arc<WorkspaceSettingsService>,
    ) -> Self {
        Self {
            app,
            mcp_connection_service,
            workspace_settings_service,
        }
    }

    /// Get MCP tools for a workspace and convert them to `OpenAI` format
    /// Now reads from cached `tools_json` in `SQLite` instead of calling MCP server
    pub fn get_tools_for_workspace(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<ChatCompletionTool>, AppError> {
        // Get workspace settings to find MCP tool selections
        let workspace_settings = self
            .workspace_settings_service
            .get_by_workspace_id(workspace_id)?
            .ok_or_else(|| AppError::Validation("Workspace settings not found".to_string()))?;

        // Parse MCP tool IDs from JSON object string: { "tool_name": "connection_id", ... }
        let mcp_tool_map: std::collections::HashMap<String, String> = if let Some(ids_json) =
            &workspace_settings.mcp_tool_ids
        {
            serde_json::from_str(ids_json)
                .map_err(|e| AppError::Validation(format!("Failed to parse MCP tool IDs: {e}")))?
        } else {
            std::collections::HashMap::new()
        };

        // Get unique connection IDs from the tool map
        let connection_ids: std::collections::HashSet<String> =
            mcp_tool_map.values().cloned().collect();

        // Get all MCP connections
        let all_connections = self.mcp_connection_service.get_all()?;

        // Filter to only connected connections from this workspace
        let workspace_connections: Vec<_> = all_connections
            .into_iter()
            .filter(|conn| connection_ids.contains(&conn.id) && conn.status == "connected")
            .collect();

        // Read tools from cached tools_json instead of fetching from MCP server
        let mut all_tools = Vec::new();

        // Add internal tools if enabled
        if workspace_settings.internal_tools_enabled == Some(1) {
            all_tools.extend(Self::get_builtin_tools());
        }

        for connection in workspace_connections {
            // Parse cached tools from tools_json column
            let mcp_tools: Vec<MCPTool> = if let Some(tools_json) = &connection.tools_json {
                serde_json::from_str(tools_json).map_err(|e| {
                    AppError::Generic(format!(
                        "Failed to parse cached tools for connection {}: {}",
                        connection.id, e
                    ))
                })?
            } else {
                // No cached tools available, skip this connection
                continue;
            };

            // Convert MCP tools to OpenAI format, but only for selected tools
            for mcp_tool in mcp_tools {
                // Check if this tool is selected for this workspace
                if let Some(selected_connection_id) = mcp_tool_map.get(&mcp_tool.name) {
                    // Only include if the tool is mapped to this connection
                    if selected_connection_id == &connection.id {
                        let input_schema: Option<serde_json::Value> = mcp_tool
                            .input_schema
                            .as_ref()
                            .and_then(|s| serde_json::from_str(s).ok());

                        let tool = ChatCompletionTool {
                            r#type: "function".to_string(),
                            function: crate::models::llm_types::ChatCompletionToolFunction {
                                name: mcp_tool.name,
                                description: mcp_tool.description,
                                parameters: input_schema,
                            },
                        };
                        all_tools.push(tool);
                    }
                }
            }
        }

        Ok(all_tools)
    }

    /// Execute an MCP tool
    pub async fn execute_tool(
        &self,
        connection_id: &str,
        tool_name: &str,
        arguments: serde_json::Value,
        context: Option<&ToolExecutionContext>,
    ) -> Result<serde_json::Value, AppError> {
        // Track tool execution start
        crate::lib::sentry_helpers::add_breadcrumb(
            "mcp.tool",
            format!("Executing tool {tool_name} via connection {connection_id}"),
            sentry::Level::Info,
        );

        let start_time = std::time::Instant::now();

        if connection_id == "builtin" {
            return match tool_name {
                "read_file" => InternalToolService::read_file(arguments).await,
                "write_file" => InternalToolService::write_file(arguments).await,
                "list_dir" => InternalToolService::list_dir(arguments).await,
                "run_command" => InternalToolService::run_command(arguments, &self.app).await,
                "ask_user" => {
                    let ctx = context.ok_or_else(|| {
                        AppError::Validation(
                            "ask_user requires tool execution context".to_string(),
                        )
                    })?;
                    ask_user::ask_user(arguments, ctx).await
                }
                _ => Err(AppError::Validation(format!(
                    "Unknown internal tool: {tool_name}"
                ))),
            };
        }

        // Get MCP connection
        let connection = self
            .mcp_connection_service
            .get_by_id(connection_id)?
            .ok_or_else(|| {
                AppError::NotFound(format!("MCP connection not found: {connection_id}"))
            })?;

        if connection.status != "connected" {
            return Err(AppError::Validation(format!(
                "MCP connection is not connected: {connection_id}"
            )));
        }

        // Parse headers
        let headers = if connection.headers.is_empty() {
            None
        } else {
            Some(connection.headers.clone())
        };

        // Execute tool using MCP client service
        let result_json = MCPClientService::call_tool(
            &self.app,
            connection.url,
            connection.r#type,
            headers,
            connection.env_vars,
            tool_name.to_string(),
            arguments,
            connection.runtime_path,
        )
        .await
        .map_err(|e| AppError::Generic(format!("Failed to execute tool {tool_name}: {e}")))?;

        // Parse result JSON
        let result: serde_json::Value = serde_json::from_str(&result_json)
            .map_err(|e| AppError::Generic(format!("Failed to parse tool result: {e}")))?;

        // Track tool execution completion
        let duration = start_time.elapsed().as_millis() as u64;
        crate::lib::sentry_helpers::track_tool_execution(
            tool_name,
            connection_id,
            duration,
            &Ok::<(), Box<dyn std::error::Error>>(()),
        );

        Ok(result)
    }

    /// Get a map of tool names to connection IDs for a workspace
    pub fn get_tool_to_connection_map(
        &self,
        workspace_id: &str,
    ) -> Result<std::collections::HashMap<String, String>, AppError> {
        // Get workspace settings to find MCP tool mappings
        let workspace_settings = self
            .workspace_settings_service
            .get_by_workspace_id(workspace_id)?
            .ok_or_else(|| AppError::Validation("Workspace settings not found".to_string()))?;

        // Parse MCP tool IDs from JSON object string: { "tool_name": "connection_id", ... }
        let mut mcp_tool_map: std::collections::HashMap<String, String> = if let Some(ids_json) =
            &workspace_settings.mcp_tool_ids
        {
            serde_json::from_str(ids_json)
                .map_err(|e| AppError::Validation(format!("Failed to parse MCP tool IDs: {e}")))?
        } else {
            std::collections::HashMap::new()
        };

        // ask_user is always available when tools are supported
        mcp_tool_map.insert("ask_user".to_string(), "builtin".to_string());

        // Add internal tools to map if enabled
        if workspace_settings.internal_tools_enabled == Some(1) {
            mcp_tool_map.insert("read_file".to_string(), "builtin".to_string());
            mcp_tool_map.insert("write_file".to_string(), "builtin".to_string());
            mcp_tool_map.insert("list_dir".to_string(), "builtin".to_string());
            mcp_tool_map.insert("run_command".to_string(), "builtin".to_string());
        }

        Ok(mcp_tool_map)
    }

    pub fn get_active_tools_info_for_workspace(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<UnifiedToolInfo>, AppError> {
        let workspace_settings = self
            .workspace_settings_service
            .get_by_workspace_id(workspace_id)?
            .ok_or_else(|| AppError::Validation("Workspace settings not found".to_string()))?;

        let mut tools_info = Vec::new();

        // Add internal tools if enabled
        if workspace_settings.internal_tools_enabled == Some(1) {
            tools_info.push(UnifiedToolInfo {
                name: "read_file".to_string(),
                server_name: "System".to_string(),
                description: Some(
                    "Read the content of a file (Absolute path required)".to_string(),
                ),
            });
            tools_info.push(UnifiedToolInfo {
                name: "write_file".to_string(),
                server_name: "System".to_string(),
                description: Some("Write content to a file (Absolute path required)".to_string()),
            });
            tools_info.push(UnifiedToolInfo {
                name: "list_dir".to_string(),
                server_name: "System".to_string(),
                description: Some(
                    "List the contents of a directory (Absolute path required)".to_string(),
                ),
            });
            tools_info.push(UnifiedToolInfo {
                name: "run_command".to_string(),
                server_name: "System".to_string(),
                description: Some(
                    "Run a shell command. Uses the app process environment. Default cwd is the system temp directory.".to_string(),
                ),
            });
        }

        // Parse MCP tool IDs
        let mcp_tool_map: std::collections::HashMap<String, String> =
            if let Some(ids_json) = &workspace_settings.mcp_tool_ids {
                serde_json::from_str(ids_json).unwrap_or_default()
            } else {
                std::collections::HashMap::new()
            };

        if !mcp_tool_map.is_empty() {
            let connection_ids: std::collections::HashSet<String> =
                mcp_tool_map.values().cloned().collect();
            let all_connections = self.mcp_connection_service.get_all()?;
            let workspace_connections: Vec<_> = all_connections
                .into_iter()
                .filter(|conn| connection_ids.contains(&conn.id) && conn.status == "connected")
                .collect();

            for connection in workspace_connections {
                let mcp_tools: Vec<MCPTool> = if let Some(tools_json) = &connection.tools_json {
                    serde_json::from_str(tools_json).unwrap_or_default()
                } else {
                    continue;
                };

                for mcp_tool in mcp_tools {
                    if let Some(selected_connection_id) = mcp_tool_map.get(&mcp_tool.name) {
                        if selected_connection_id == &connection.id {
                            tools_info.push(UnifiedToolInfo {
                                name: mcp_tool.name,
                                server_name: connection.name.clone(),
                                description: mcp_tool.description,
                            });
                        }
                    }
                }
            }
        }

        Ok(tools_info)
    }

    fn get_builtin_tools() -> Vec<ChatCompletionTool> {
        vec![
            ChatCompletionTool {
                r#type: "function".to_string(),
                function: crate::models::llm_types::ChatCompletionToolFunction {
                    name: "read_file".to_string(),
                    description: Some(
                        "Read the content of a file (Absolute path required). \
                        Examples: \
                        - { \"path\": \"/abs/path/to/file.txt\" } \
                        - { \"path\": \"/Users/name/project/src/main.rs\" }".to_string(),
                    ),
                    parameters: Some(serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Absolute path to the file" }
                        },
                        "required": ["path"]
                    })),
                },
            },
            ChatCompletionTool {
                r#type: "function".to_string(),
                function: crate::models::llm_types::ChatCompletionToolFunction {
                    name: "write_file".to_string(),
                    description: Some(
                        "Write content to a file (Absolute path required). \
                        Examples: \
                        - { \"path\": \"/abs/path/to/file.txt\", \"content\": \"hello world\" } \
                        - { \"path\": \"/Users/name/project/config.json\", \"content\": \"{\\\"key\\\": \\\"value\\\"}\" }".to_string(),
                    ),
                    parameters: Some(serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Absolute path to the file" },
                            "content": { "type": "string", "description": "Content to write" }
                        },
                        "required": ["path", "content"]
                    })),
                },
            },
            ChatCompletionTool {
                r#type: "function".to_string(),
                function: crate::models::llm_types::ChatCompletionToolFunction {
                    name: "list_dir".to_string(),
                    description: Some(
                        "List the contents of a directory (Absolute path required). \
                        Examples: \
                        - { \"path\": \"/abs/path/to/dir\" } \
                        - { \"path\": \"/Users/name/code/nexo\" }".to_string(),
                    ),
                    parameters: Some(serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Absolute path to the directory" }
                        },
                        "required": ["path"]
                    })),
                },
            },
            ChatCompletionTool {
                r#type: "function".to_string(),
                function: crate::models::llm_types::ChatCompletionToolFunction {
                    name: "run_command".to_string(),
                    description: Some(
                        "Run a shell command. Uses the app process environment. Default cwd is the system temp directory. \
                        Examples: \
                        - { \"command\": \"ls\", \"args\": [\"-la\"], \"cwd\": \"/abs/path\" } \
                        - { \"command\": \"git\", \"args\": [\"status\"] } \
                        - { \"command\": \"npm\", \"args\": [\"install\", \"lodash\"] } \
                        - { \"command\": \"python\", \"args\": [\"--version\"] }".to_string(),
                    ),
                    parameters: Some(serde_json::json!({
                        "type": "object",
                        "properties": {
                            "command": { "type": "string", "description": "Command to run" },
                            "args": { "type": "array", "items": { "type": "string" }, "description": "Arguments for the command" },
                            "cwd": { "type": "string", "description": "Working directory (absolute path). Defaults to system temp directory." }
                        },
                        "required": ["command"]
                    })),
                },
            },
        ]
    }
}
