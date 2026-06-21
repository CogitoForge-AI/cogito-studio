// TODO: Re-enable registration in `builtin/mod.rs` once cross-platform browser automation is stable.
#![allow(dead_code)]

use crate::error::AppError;
use crate::features::browser::BrowserService;
use crate::features::tool::core::context::ToolExecutionContext;
use crate::features::tool::core::result::ToolResult;
use crate::features::tool::core::spec::{ToolBehavior, ToolSpec};
use crate::features::tool::core::traits::Tool;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;

pub struct BrowserNavigateTool {
    browser_service: Arc<BrowserService>,
}

impl BrowserNavigateTool {
    pub const fn new(browser_service: Arc<BrowserService>) -> Self {
        Self { browser_service }
    }
}

#[async_trait]
impl Tool for BrowserNavigateTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec::new(
            "browser_navigate",
            Some(
                "Open a URL in the app browser. Reuses the active tab when possible. \
                Example: { \"url\": \"https://example.com\" }"
                    .to_string(),
            ),
            Some(json!({
                "type": "object",
                "properties": {
                    "url": { "type": "string", "description": "URL to navigate to" }
                },
                "required": ["url"]
            })),
            "builtin",
            "System",
            ToolBehavior::immediate(),
        )
    }

    async fn execute(
        &self,
        arguments: Value,
        _ctx: &ToolExecutionContext,
    ) -> Result<ToolResult, AppError> {
        let url = arguments["url"]
            .as_str()
            .ok_or_else(|| AppError::Validation("Missing 'url' parameter".to_string()))?;

        let tab_id = self.browser_service.navigate_or_create_tab(url).await?;
        let title = self.browser_service.get_page_title(Some(&tab_id)).await?;

        Ok(ToolResult::ok(
            "browser_navigate",
            serde_json::to_string(&json!({
                "tab_id": tab_id,
                "url": url,
                "title": title,
            }))?,
        ))
    }
}

pub struct BrowserClickTool {
    browser_service: Arc<BrowserService>,
}

impl BrowserClickTool {
    pub const fn new(browser_service: Arc<BrowserService>) -> Self {
        Self { browser_service }
    }
}

#[async_trait]
impl Tool for BrowserClickTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec::new(
            "browser_click",
            Some(
                "Click an element in the active browser tab using a CSS selector. \
                Example: { \"selector\": \"button.submit\" }"
                    .to_string(),
            ),
            Some(json!({
                "type": "object",
                "properties": {
                    "selector": { "type": "string", "description": "CSS selector" }
                },
                "required": ["selector"]
            })),
            "builtin",
            "System",
            ToolBehavior::immediate(),
        )
    }

    async fn execute(
        &self,
        arguments: Value,
        _ctx: &ToolExecutionContext,
    ) -> Result<ToolResult, AppError> {
        let selector = arguments["selector"]
            .as_str()
            .ok_or_else(|| AppError::Validation("Missing 'selector' parameter".to_string()))?;

        self.browser_service.click_selector(None, selector).await?;

        Ok(ToolResult::ok(
            "browser_click",
            json!({ "status": "clicked", "selector": selector }).to_string(),
        ))
    }
}

pub struct BrowserTypeTool {
    browser_service: Arc<BrowserService>,
}

impl BrowserTypeTool {
    pub const fn new(browser_service: Arc<BrowserService>) -> Self {
        Self { browser_service }
    }
}

#[async_trait]
impl Tool for BrowserTypeTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec::new(
            "browser_type",
            Some(
                "Type text into the focused element in the active browser tab. \
                Example: { \"text\": \"hello\" }"
                    .to_string(),
            ),
            Some(json!({
                "type": "object",
                "properties": {
                    "text": { "type": "string", "description": "Text to insert" }
                },
                "required": ["text"]
            })),
            "builtin",
            "System",
            ToolBehavior::immediate(),
        )
    }

    async fn execute(
        &self,
        arguments: Value,
        _ctx: &ToolExecutionContext,
    ) -> Result<ToolResult, AppError> {
        let text = arguments["text"]
            .as_str()
            .ok_or_else(|| AppError::Validation("Missing 'text' parameter".to_string()))?;

        self.browser_service.type_text(None, text).await?;

        Ok(ToolResult::ok(
            "browser_type",
            json!({ "status": "typed", "length": text.len() }).to_string(),
        ))
    }
}

pub struct BrowserScreenshotTool {
    browser_service: Arc<BrowserService>,
}

impl BrowserScreenshotTool {
    pub const fn new(browser_service: Arc<BrowserService>) -> Self {
        Self { browser_service }
    }
}

#[async_trait]
impl Tool for BrowserScreenshotTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec::new(
            "browser_screenshot",
            Some(
                "Capture a JPEG screenshot of the active browser tab (base64). \
                Example: {}"
                    .to_string(),
            ),
            Some(json!({ "type": "object", "properties": {} })),
            "builtin",
            "System",
            ToolBehavior::immediate(),
        )
    }

    async fn execute(
        &self,
        _arguments: Value,
        _ctx: &ToolExecutionContext,
    ) -> Result<ToolResult, AppError> {
        let data = self.browser_service.capture_screenshot(None).await?;

        Ok(ToolResult::ok(
            "browser_screenshot",
            serde_json::to_string(&json!({
                "format": "jpeg",
                "data_base64": data,
            }))?,
        ))
    }
}

pub struct BrowserGetContentTool {
    browser_service: Arc<BrowserService>,
}

impl BrowserGetContentTool {
    pub const fn new(browser_service: Arc<BrowserService>) -> Self {
        Self { browser_service }
    }
}

#[async_trait]
impl Tool for BrowserGetContentTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec::new(
            "browser_get_content",
            Some(
                "Extract visible text from the active browser tab. \
                Example: { \"max_chars\": 8000 }"
                    .to_string(),
            ),
            Some(json!({
                "type": "object",
                "properties": {
                    "max_chars": {
                        "type": "integer",
                        "description": "Maximum characters to return (default 8000)"
                    }
                }
            })),
            "builtin",
            "System",
            ToolBehavior::immediate(),
        )
    }

    async fn execute(
        &self,
        arguments: Value,
        _ctx: &ToolExecutionContext,
    ) -> Result<ToolResult, AppError> {
        let max_chars = arguments["max_chars"].as_u64().unwrap_or(8000) as usize;

        let text = self.browser_service.get_page_text(None, max_chars).await?;

        Ok(ToolResult::ok(
            "browser_get_content",
            serde_json::to_string(&json!({ "text": text }))?,
        ))
    }
}
