use crate::error::AppError;
use crate::features::agent::manager::AgentManager;
use crate::features::tool::ask_user::get_ask_user_tool;
use crate::features::tool::service::ToolService;
use crate::models::llm_types::{model_supports_tools, ChatCompletionTool};
use rust_mcp_sdk::McpClient;
use tauri::AppHandle;

/// Resolved tools and optional system-prompt override for a chat turn.
pub struct ToolContext {
    pub tools: Option<Vec<ChatCompletionTool>>,
    pub system_prompt_override: Option<String>,
}

fn append_ask_user_tool(tools: &mut Vec<ChatCompletionTool>) {
    if !tools.iter().any(|t| t.function.name == "ask_user") {
        tools.push(get_ask_user_tool());
    }
}

pub async fn resolve_tool_context(
    agent_manager: &AgentManager,
    tool_service: &ToolService,
    app: &AppHandle,
    agent_id: Option<&str>,
    workspace_id: &str,
    model: &str,
) -> Result<ToolContext, AppError> {
    if let Some(agent_id) = agent_id {
        let client = agent_manager
            .get_agent_client(app, agent_id)
            .await
            .map_err(|e| AppError::Generic(e.to_string()))?;

        let tool_result = client
            .list_tools(None)
            .await
            .map_err(|e| AppError::Generic(e.to_string()))?;

        let mut agent_tools: Vec<ChatCompletionTool> = tool_result
            .tools
            .into_iter()
            .map(|t| ChatCompletionTool {
                r#type: "function".to_string(),
                function: crate::models::llm_types::ChatCompletionToolFunction {
                    name: t.name,
                    description: t.description,
                    parameters: Some(
                        serde_json::to_value(&t.input_schema).unwrap_or(serde_json::json!({})),
                    ),
                },
            })
            .collect();

        if model_supports_tools(model) {
            append_ask_user_tool(&mut agent_tools);
        }

        let instructions = agent_manager
            .get_agent_instructions(agent_id)
            .map_err(|e| AppError::Generic(e.to_string()))?;

        return Ok(ToolContext {
            tools: if agent_tools.is_empty() {
                None
            } else {
                Some(agent_tools)
            },
            system_prompt_override: Some(instructions),
        });
    }

    if !model_supports_tools(model) {
        return Ok(ToolContext {
            tools: None,
            system_prompt_override: None,
        });
    }

    let mut tools = tool_service.get_tools_for_workspace(workspace_id)?;
    append_ask_user_tool(&mut tools);

    Ok(ToolContext {
        tools: if tools.is_empty() { None } else { Some(tools) },
        system_prompt_override: None,
    })
}
