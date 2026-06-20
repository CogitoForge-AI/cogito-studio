use super::models::{
    RuntimeHandle, RuntimeKind, RuntimeSpec, SandboxManifest, SandboxRuntimeInfo, SandboxStatus,
};
use crate::error::AppError;
use crate::features::runtime::node::service::NodeRuntime;
use crate::features::runtime::python::service::{ExecutionResult, PythonRuntime};
use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use tauri::AppHandle;

pub struct SandboxService;

impl SandboxService {
    pub fn manifest() -> SandboxManifest {
        SandboxManifest::default()
    }

    pub async fn ensure_ready(app: &AppHandle) -> Result<(), AppError> {
        let manifest = Self::manifest();

        if !PythonRuntime::is_installed(app, &manifest.python.version) {
            PythonRuntime::install(app, &manifest.python.version, &manifest.python.packages)?;
        }

        if !NodeRuntime::is_installed(app, &manifest.nodejs.version) {
            NodeRuntime::install(app, &manifest.nodejs.version, &manifest.nodejs.packages)?;
        }

        Ok(())
    }

    pub fn status(app: &AppHandle) -> SandboxStatus {
        let manifest = Self::manifest();

        let python_installed = PythonRuntime::is_installed(app, &manifest.python.version);
        let python_path = if python_installed {
            PythonRuntime::get_installed_python(app, &manifest.python.version)
                .ok()
                .map(|p| p.to_string_lossy().to_string())
        } else {
            None
        };

        let node_installed = NodeRuntime::is_installed(app, &manifest.nodejs.version);
        let node_path = if node_installed {
            NodeRuntime::detect(app, &manifest.nodejs.version)
                .ok()
                .map(|rt| rt.node_path.to_string_lossy().to_string())
        } else {
            None
        };

        SandboxStatus {
            ready: python_installed && node_installed,
            python: SandboxRuntimeInfo {
                version: manifest.python.version,
                installed: python_installed,
                path: python_path,
            },
            nodejs: SandboxRuntimeInfo {
                version: manifest.nodejs.version,
                installed: node_installed,
                path: node_path,
            },
        }
    }

    pub fn get(app: &AppHandle, kind: RuntimeKind) -> Result<RuntimeHandle, AppError> {
        let manifest = Self::manifest();
        match kind {
            RuntimeKind::Python => Self::python_handle(app, &manifest.python),
            RuntimeKind::NodeJs => Self::node_handle(app, &manifest.nodejs),
        }
    }

    pub fn env(
        app: &AppHandle,
        kind: RuntimeKind,
        base: HashMap<String, String>,
    ) -> Result<HashMap<String, String>, AppError> {
        let handle = Self::get(app, kind)?;
        let mut env = base;

        match kind {
            RuntimeKind::Python => {
                if !env.contains_key("UV_PYTHON") {
                    if let Some(python) = handle.executables.get("python") {
                        env.insert(
                            "UV_PYTHON".to_string(),
                            python.to_string_lossy().to_string(),
                        );
                    }
                }
            }
            RuntimeKind::NodeJs => {
                let bin_dir = handle.bin_dir.to_string_lossy().to_string();
                let separator = if cfg!(windows) { ";" } else { ":" };
                let new_path = if let Some(current) = env.get("PATH") {
                    if current.is_empty() {
                        bin_dir
                    } else {
                        format!("{bin_dir}{separator}{current}")
                    }
                } else if let Ok(current) = std::env::var("PATH") {
                    if current.is_empty() {
                        bin_dir
                    } else {
                        format!("{bin_dir}{separator}{current}")
                    }
                } else {
                    bin_dir
                };
                env.insert("PATH".to_string(), new_path);
            }
        }

        Ok(env)
    }

    pub fn run_script(
        app: &AppHandle,
        kind: RuntimeKind,
        script: &str,
    ) -> Result<ExecutionResult, AppError> {
        match kind {
            RuntimeKind::Python => {
                let version = Self::manifest().python.version;
                PythonRuntime::execute_script(app, Some(version), script)
            }
            RuntimeKind::NodeJs => Err(AppError::Node(
                "run_script is not supported for NodeJs runtime".to_string(),
            )),
        }
    }

    pub fn add_packages(
        app: &AppHandle,
        kind: RuntimeKind,
        packages: &[String],
    ) -> Result<(), AppError> {
        if packages.is_empty() {
            return Ok(());
        }

        let manifest = Self::manifest();
        match kind {
            RuntimeKind::Python => {
                let python_path =
                    PythonRuntime::get_installed_python(app, &manifest.python.version)?;
                PythonRuntime::install_packages(app, &python_path, packages)
            }
            RuntimeKind::NodeJs => {
                NodeRuntime::install_packages(app, &manifest.nodejs.version, packages)
            }
        }
    }

    fn python_handle(app: &AppHandle, spec: &RuntimeSpec) -> Result<RuntimeHandle, AppError> {
        let rt = PythonRuntime::detect(app, &spec.version)?;
        let python_path = rt.python_path.clone();
        let bin_dir = python_path
            .parent().map_or_else(|| PathBuf::from("."), PathBuf::from);

        let mut executables = BTreeMap::new();
        executables.insert("python".to_string(), python_path.clone());
        executables.insert("python3".to_string(), python_path);
        executables.insert("uv".to_string(), rt.uv_path);

        Ok(RuntimeHandle {
            kind: RuntimeKind::Python,
            version: spec.version.clone(),
            bin_dir,
            executables,
        })
    }

    fn node_handle(app: &AppHandle, spec: &RuntimeSpec) -> Result<RuntimeHandle, AppError> {
        let rt = NodeRuntime::detect(app, &spec.version)?;
        let node_path = rt.node_path.clone();
        let bin_dir = rt.bin_dir().unwrap_or_else(|| {
            node_path
                .parent().map_or_else(|| PathBuf::from("."), PathBuf::from)
        });

        let mut executables = BTreeMap::new();
        executables.insert("node".to_string(), node_path);

        let npm_name = if cfg!(windows) { "npm.cmd" } else { "npm" };
        let npx_name = if cfg!(windows) { "npx.cmd" } else { "npx" };
        let npm_path = bin_dir.join(npm_name);
        let npx_path = bin_dir.join(npx_name);

        if npm_path.exists() || npm_path.symlink_metadata().is_ok() {
            executables.insert("npm".to_string(), npm_path);
        }
        if npx_path.exists() || npx_path.symlink_metadata().is_ok() {
            executables.insert("npx".to_string(), npx_path);
        }

        Ok(RuntimeHandle {
            kind: RuntimeKind::NodeJs,
            version: spec.version.clone(),
            bin_dir,
            executables,
        })
    }
}
