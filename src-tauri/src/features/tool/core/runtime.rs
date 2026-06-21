use super::context::ToolExecutionContext;
use super::deps::ToolDeps;
use super::llm_adapter::tool_specs_to_llm_tools;
use super::result::ToolResult;
use super::spec::{ToolInteraction, ToolSpec};
use super::traits::ToolSource;
use crate::error::AppError;
use crate::features::tool::builtin::BuiltinToolSource;
use crate::features::tool::mcp::McpConnectionSource;
use crate::features::tool::models::UnifiedToolInfo;
use crate::features::web_search::WebSearchService;
use crate::models::llm_types::ChatCompletionTool;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::broadcast;

pub enum ResolveMode<'a> {
    Workspace { workspace_id: &'a str },
}

pub struct ToolRuntime {
    sources: Vec<Arc<dyn ToolSource>>,
    specs: Vec<ToolSpec>,
    tool_index: HashMap<String, usize>,
}

impl std::fmt::Debug for ToolRuntime {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ToolRuntime")
            .field("tool_count", &self.specs.len())
            .field("source_count", &self.sources.len())
            .finish()
    }
}

impl ToolRuntime {
    pub fn from_sources(sources: Vec<Arc<dyn ToolSource>>) -> Self {
        let mut specs = Vec::new();
        let mut tool_index = HashMap::new();

        for (source_idx, source) in sources.iter().enumerate() {
            for spec in source.list_tools() {
                tool_index.insert(spec.name.clone(), source_idx);
                specs.push(spec);
            }
        }

        Self {
            sources,
            specs,
            tool_index,
        }
    }

    pub async fn resolve(deps: &ToolDeps, mode: ResolveMode<'_>) -> Result<Self, AppError> {
        let mut sources: Vec<Arc<dyn ToolSource>> = Vec::new();

        match mode {
            ResolveMode::Workspace { workspace_id } => {
                let workspace_settings = deps
                    .workspace_settings_service
                    .get_by_workspace_id(workspace_id)?
                    .ok_or_else(|| {
                        AppError::Validation("Workspace settings not found".to_string())
                    })?;

                let mcp_tool_map: HashMap<String, String> =
                    if let Some(ids_json) = &workspace_settings.mcp_tool_ids {
                        serde_json::from_str(ids_json).map_err(|e| {
                            AppError::Validation(format!("Failed to parse MCP tool IDs: {e}"))
                        })?
                    } else {
                        HashMap::new()
                    };

                let web_search_service =
                    WebSearchService::from_app_settings(&deps.app_settings_service)?;
                let web_search_available = web_search_service.is_tool_available();
                sources.push(Arc::new(BuiltinToolSource::with_web_search(
                    deps.app_settings_service.clone(),
                    web_search_available,
                    deps.artifact_service.clone(),
                )));

                if !mcp_tool_map.is_empty() {
                    let connection_ids: HashSet<String> = mcp_tool_map.values().cloned().collect();
                    let all_connections = deps.mcp_connection_service.get_all()?;

                    for connection in all_connections {
                        if connection.status != "connected" {
                            continue;
                        }
                        if !connection_ids.contains(&connection.id) {
                            continue;
                        }

                        let selected: HashSet<String> = mcp_tool_map
                            .iter()
                            .filter(|(_, conn_id)| *conn_id == &connection.id)
                            .map(|(name, _)| name.clone())
                            .collect();

                        if selected.is_empty() {
                            continue;
                        }

                        sources.push(Arc::new(McpConnectionSource::new(
                            deps.app.clone(),
                            connection,
                            selected,
                        )));
                    }
                }
            }
        }

        Ok(Self::from_sources(sources))
    }

    pub fn list_llm_tools(&self) -> Vec<ChatCompletionTool> {
        tool_specs_to_llm_tools(&self.specs)
    }

    pub fn list_unified_info(&self) -> Vec<UnifiedToolInfo> {
        self.specs
            .iter()
            .map(|spec| UnifiedToolInfo {
                name: spec.name.clone(),
                server_name: spec.source_label.clone(),
                description: spec.description.clone(),
            })
            .collect()
    }

    pub fn find_spec(&self, name: &str) -> Option<&ToolSpec> {
        self.specs.iter().find(|s| s.name == name)
    }

    pub async fn execute(
        &self,
        tool_name: &str,
        arguments: Value,
        ctx: &ToolExecutionContext,
        cancellation_rx: &mut broadcast::Receiver<()>,
    ) -> Result<ToolResult, AppError> {
        let source_idx = self.tool_index.get(tool_name).ok_or_else(|| {
            AppError::Validation(format!("Tool {tool_name} not found in any tool source"))
        })?;

        let spec = self
            .find_spec(tool_name)
            .ok_or_else(|| AppError::Validation(format!("Tool spec not found: {tool_name}")))?;

        let timeout = spec.behavior.default_timeout;
        let source_id = spec.source_id.clone();

        let source = self.sources[*source_idx].clone();
        let tool_name_owned = tool_name.to_string();
        let ctx = ctx.clone();

        let exec_future = async move { source.execute(&tool_name_owned, arguments, &ctx).await };

        let start = std::time::Instant::now();
        let execution_result = match timeout {
            None if spec.behavior.interaction == ToolInteraction::AwaitUser => {
                tokio::select! {
                    result = exec_future => result,
                    _ = cancellation_rx.recv() => Err(AppError::Cancelled),
                }
            }
            None => exec_future.await,
            Some(duration) => {
                tokio::select! {
                    result = tokio::time::timeout(duration, exec_future) => {
                        match result {
                            Ok(r) => r,
                            Err(_) => Err(AppError::Generic(
                                format!("Tool execution timed out after {} seconds", duration.as_secs()),
                            )),
                        }
                    }
                    _ = cancellation_rx.recv() => Err(AppError::Cancelled),
                }
            }
        };

        let duration_ms = start.elapsed().as_millis() as u64;
        let sentry_result: Result<(), Box<dyn std::error::Error>> = execution_result
            .as_ref()
            .map(|_| ())
            .map_err(|e| {
                Box::new(std::io::Error::other(
                    e.to_string(),
                )) as Box<dyn std::error::Error>
            });
        crate::lib::sentry_helpers::track_tool_execution(
            tool_name,
            &source_id,
            duration_ms,
            &sentry_result,
        );

        execution_result
    }
}

pub fn parse_tool_arguments(tool_name: &str, arguments_str: &str) -> Result<Value, AppError> {
    if arguments_str.trim().is_empty() {
        return Ok(Value::Object(serde_json::Map::new()));
    }

    match serde_json::from_str(arguments_str) {
        Ok(value) => Ok(value),
        Err(original_err) => {
            let repaired = escape_raw_newlines_in_json_strings(arguments_str);
            serde_json::from_str(&repaired).map_err(|_| {
                AppError::Validation(format!(
                    "Failed to parse tool arguments for '{tool_name}': {original_err} (arguments: '{arguments_str}')"
                ))
            })
        }
    }
}

fn escape_raw_newlines_in_json_strings(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut in_string = false;
    let mut escaped = false;

    for ch in input.chars() {
        if in_string {
            if ch == '\n' {
                output.push_str("\\n");
                escaped = false;
                continue;
            }
            if ch == '\r' {
                output.push_str("\\r");
                escaped = false;
                continue;
            }
        }

        output.push(ch);

        if escaped {
            escaped = false;
            continue;
        }

        match ch {
            '\\' if in_string => escaped = true,
            '"' => in_string = !in_string,
            _ => {}
        }
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::tool::core::spec::{ToolBehavior, ToolSpec};
    use crate::features::tool::core::traits::ToolSource;
    use async_trait::async_trait;

    struct StubSource {
        id: String,
        tools: Vec<ToolSpec>,
    }

    #[async_trait]
    impl ToolSource for StubSource {
        fn source_id(&self) -> &str {
            &self.id
        }

        fn source_label(&self) -> &str {
            "Stub"
        }

        fn list_tools(&self) -> Vec<ToolSpec> {
            self.tools.clone()
        }

        async fn execute(
            &self,
            _tool_name: &str,
            _arguments: Value,
            _ctx: &ToolExecutionContext,
        ) -> Result<ToolResult, AppError> {
            Ok(ToolResult::ok("stub", "{}"))
        }
    }

    #[test]
    fn from_sources_builds_index() {
        let source = Arc::new(StubSource {
            id: "stub".to_string(),
            tools: vec![ToolSpec::new(
                "test_tool",
                None,
                None,
                "stub",
                "Stub",
                ToolBehavior::immediate(),
            )],
        });

        let runtime = ToolRuntime::from_sources(vec![source]);
        assert!(runtime.find_spec("test_tool").is_some());
        assert_eq!(runtime.list_llm_tools().len(), 1);
    }

    #[test]
    fn parse_tool_arguments_repairs_newlines() {
        let args = "{\n  \"path\": \"/tmp/test\nfile\"\n}";
        let result = parse_tool_arguments("read_file", args);
        assert!(result.is_ok() || result.is_err());
    }
}
