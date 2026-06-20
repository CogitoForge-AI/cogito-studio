mod ask_user;
mod browser;
mod create_artifact;
mod list_dir;
mod read_file;
mod run_command;
mod web_search;
mod write_file;

use crate::error::AppError;
use crate::features::app_settings::service::AppSettingsService;
use crate::features::artifacts::ArtifactService;
use crate::features::browser::BrowserService;
use crate::features::tool::core::context::ToolExecutionContext;
use crate::features::tool::core::result::ToolResult;
use crate::features::tool::core::spec::ToolSpec;
use crate::features::tool::core::traits::{Tool, ToolSource};
use ask_user::AskUserTool;
use async_trait::async_trait;
use browser::{
    BrowserClickTool, BrowserGetContentTool, BrowserNavigateTool, BrowserScreenshotTool,
    BrowserTypeTool,
};
use create_artifact::CreateArtifactTool;
use list_dir::ListDirTool;
use read_file::ReadFileTool;
use run_command::RunCommandTool;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use web_search::WebSearchTool;
use write_file::WriteFileTool;

pub use ask_user::{get_ask_user_tool, resolve_answers_to_llm_format};

pub fn append_ask_user_if_missing(tools: &mut Vec<crate::models::llm_types::ChatCompletionTool>) {
    if !tools.iter().any(|t| t.function.name == "ask_user") {
        tools.push(get_ask_user_tool());
    }
}

pub struct BuiltinToolSource {
    source_id: String,
    source_label: String,
    tools: HashMap<String, Arc<dyn Tool>>,
}

impl BuiltinToolSource {
    pub fn new() -> Self {
        Self::with_tools(default_tools(None, false, None, None))
    }

    pub fn with_web_search(
        app_settings_service: Arc<AppSettingsService>,
        web_search_available: bool,
        artifact_service: Arc<ArtifactService>,
        browser_service: Arc<BrowserService>,
    ) -> Self {
        Self::with_tools(default_tools(
            Some(app_settings_service),
            web_search_available,
            Some(artifact_service),
            Some(browser_service),
        ))
    }

    fn with_tools(tools: Vec<Arc<dyn Tool>>) -> Self {
        let mut map = HashMap::new();
        for tool in tools {
            let spec = tool.spec();
            map.insert(spec.name.clone(), tool);
        }
        Self {
            source_id: "builtin".to_string(),
            source_label: "System".to_string(),
            tools: map,
        }
    }
}

impl Default for BuiltinToolSource {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolSource for BuiltinToolSource {
    fn source_id(&self) -> &str {
        &self.source_id
    }

    fn source_label(&self) -> &str {
        &self.source_label
    }

    fn list_tools(&self) -> Vec<ToolSpec> {
        self.tools.values().map(|t| t.spec()).collect()
    }

    async fn execute(
        &self,
        tool_name: &str,
        arguments: Value,
        ctx: &ToolExecutionContext,
    ) -> Result<ToolResult, AppError> {
        let tool = self
            .tools
            .get(tool_name)
            .ok_or_else(|| AppError::Validation(format!("Unknown builtin tool: {tool_name}")))?;
        tool.execute(arguments, ctx).await
    }
}

fn default_tools(
    app_settings_service: Option<Arc<AppSettingsService>>,
    web_search_available: bool,
    artifact_service: Option<Arc<ArtifactService>>,
    browser_service: Option<Arc<BrowserService>>,
) -> Vec<Arc<dyn Tool>> {
    let mut tools: Vec<Arc<dyn Tool>> = vec![
        Arc::new(ReadFileTool),
        Arc::new(WriteFileTool),
        Arc::new(ListDirTool),
        Arc::new(RunCommandTool),
        Arc::new(AskUserTool),
    ];

    if let Some(service) = artifact_service {
        tools.push(Arc::new(CreateArtifactTool::new(service)));
    }

    if web_search_available {
        if let Some(service) = app_settings_service {
            tools.push(Arc::new(WebSearchTool::new(service)));
        }
    }

    if let Some(service) = browser_service {
        tools.push(Arc::new(BrowserNavigateTool::new(service.clone())));
        tools.push(Arc::new(BrowserClickTool::new(service.clone())));
        tools.push(Arc::new(BrowserTypeTool::new(service.clone())));
        tools.push(Arc::new(BrowserScreenshotTool::new(service.clone())));
        tools.push(Arc::new(BrowserGetContentTool::new(service)));
    }

    tools
}
