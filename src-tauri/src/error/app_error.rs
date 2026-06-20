use serde::Serializer;
use thiserror::Error;

/// Application error types with Sentry integration
#[derive(Error, Debug)]
pub enum AppError {
    #[error("[Database] {0}")]
    Database(#[from] rusqlite::Error),

    #[error("[Not Found] {0}")]
    NotFound(String),

    #[error("[Validation] {0}")]
    Validation(String),

    #[error("[IO] {0}")]
    Io(#[from] std::io::Error),

    #[error("[Serialization] {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("[Tauri] {0}")]
    Tauri(#[from] tauri::Error),

    #[error("[Network] {0}")]
    Http(#[from] reqwest::Error),

    #[error("[LLM] {0}")]
    Llm(String),

    #[error("[Python] {0}")]
    Python(String),

    #[error("[Node] {0}")]
    Node(String),

    #[error("[MCP] {0}")]
    Mcp(String),

    #[error("[Zip] {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("[Cancelled] Operation cancelled by user")]
    Cancelled,

    #[error("[Error] {0}")]
    Generic(String),
}

impl AppError {
    /// Report this error to Sentry with optional context
    #[allow(dead_code)]
    pub fn report_to_sentry(&self, context: Option<&str>) {
        // Only report in production or when explicitly enabled
        if cfg!(not(debug_assertions)) || std::env::var("SENTRY_ENABLED").is_ok() {
            sentry::capture_error(self);

            if let Some(ctx) = context {
                sentry::add_breadcrumb(sentry::Breadcrumb {
                    message: Some(ctx.to_string()),
                    level: sentry::Level::Error,
                    ..Default::default()
                });
            }
        }
    }

    /// Report with additional tags
    #[allow(dead_code)]
    pub fn report_with_tags(&self, tags: Vec<(&str, &str)>) {
        if cfg!(not(debug_assertions)) || std::env::var("SENTRY_ENABLED").is_ok() {
            sentry::with_scope(
                |scope| {
                    for (key, value) in tags {
                        scope.set_tag(key, value);
                    }
                },
                || {
                    sentry::capture_error(self);
                },
            );
        }
    }
}

// Manual Serialize implementation to ensure Tauri receives a proper JSON error object
// or just a string. Tauri commands usually expect the error to be serializable.
impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_str())
    }
}
