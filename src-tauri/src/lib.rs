mod constants;
mod db;
mod error;
mod events;
mod features;
#[cfg(any(
    target_os = "linux",
    target_os = "dragonfly",
    target_os = "freebsd",
    target_os = "netbsd",
    target_os = "openbsd"
))]
mod linux_window_chrome;
mod menu;
mod models;
mod path_url;
mod path_util;

mod services;
mod state;

// Sentry helper macros and functions
#[macro_use]
mod lib {
    pub mod sentry_helpers;
}

use std::sync::Arc;
use tauri::Manager;
#[cfg(target_os = "macos")]
use tauri::Position;

/// Initialize Sentry for error tracking and performance monitoring
/// DSN is embedded at compile time via build.rs
fn init_sentry() -> sentry::ClientInitGuard {
    // Use env!() macro to get DSN embedded at compile time
    // This reads the value set by build.rs during build
    let dsn = option_env!("RUST_SENTRY_DSN")
        .and_then(|s| if s.is_empty() { None } else { Some(s) })
        .and_then(|s| s.parse().ok());

    let guard = sentry::init(sentry::ClientOptions {
        dsn,
        release: sentry::release_name!(),
        environment: Some(
            if cfg!(debug_assertions) {
                "development"
            } else {
                "production"
            }
            .into(),
        ),
        sample_rate: 1.0,
        traces_sample_rate: if cfg!(debug_assertions) { 1.0 } else { 0.1 },
        attach_stacktrace: true,
        ..Default::default()
    });

    // Panic handler is automatically registered when sentry is initialized
    // No need to call register_panic_handler() separately in sentry 0.34

    // Set global context
    sentry::configure_scope(|scope| {
        scope.set_tag("app.version", env!("CARGO_PKG_VERSION"));
        scope.set_tag("app.name", "nexo");
    });

    guard
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize Sentry
    let _sentry_guard = init_sentry();
    let builder = tauri::Builder::default();

    builder
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("app".to_string()),
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                ])
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Maximize the main window on startup and ensure it's at the top
            if let Some(window) = app.get_webview_window("main") {
                // Maximize first
                if let Err(e) = window.maximize() {
                    log::error!("Failed to maximize window: {e}");
                }
                if let Err(e) = window.set_focus() {
                    log::error!("Failed to focus window: {e}");
                }

                #[cfg(any(
                    target_os = "linux",
                    target_os = "dragonfly",
                    target_os = "freebsd",
                    target_os = "netbsd",
                    target_os = "openbsd"
                ))]
                linux_window_chrome::configure_frameless_window(window);

                // On macOS, ensure window is at position (0, 0) to remove any gap
                #[cfg(target_os = "macos")]
                {
                    // Set position to (0, 0) after a short delay to ensure maximize completes
                    let window_clone = window;
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(100));
                        if let Err(e) =
                            window_clone.set_position(Position::Physical(tauri::PhysicalPosition {
                                x: 0,
                                y: 0,
                            }))
                        {
                            log::error!("Failed to set window position: {e}");
                        }
                    });
                }
            }

            // Initialize AppState
            let app_handle = Arc::new(app.handle().clone());
            let app_state = state::AppState::new(app_handle).map_err(|e| {
                // Report initialization error to Sentry
                sentry::capture_error(&e);
                sentry::add_breadcrumb(sentry::Breadcrumb {
                    message: Some("Failed to initialize app state".to_string()),
                    level: sentry::Level::Error,
                    ..Default::default()
                });
                anyhow::anyhow!("Failed to initialize app state: {e}")
            })?;

            app.manage(app_state);

            // Cache parent webview platform state for child browser webviews (macOS/Linux).
            if let Some(managed) = app.try_state::<state::AppState>() {
                if let Err(e) = managed.browser_service.init_platform() {
                    log::error!("Failed to initialize browser platform state: {e}");
                }
            }

            // Start skill filesystem watcher
            let managed = app.state::<state::AppState>();
            if let Ok(skills_dir) = managed.skill_service.skills_dir_path() {
                if let Err(e) = features::skill::watcher::SkillWatcher::start(
                    app.handle().clone(),
                    skills_dir,
                    managed.skill_sync_coordinator.clone(),
                ) {
                    log::error!("Failed to start skill watcher: {e}");
                }
            }

            if let Err(e) = managed.skill_sync_coordinator.sync_now() {
                log::error!("Initial skill sync failed: {e}");
            }

            // Initialize MCPClientState
            let mcp_client_state = state::MCPClientState::new();
            app.manage(mcp_client_state);

            // Bootstrap sandbox in background (mandatory Python + Node runtimes)
            let bootstrap_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) =
                    features::sandbox::SandboxService::ensure_ready(&bootstrap_handle).await
                {
                    tracing::error!("Sandbox bootstrap failed: {e}");
                }
            });

            // Create and set menu
            let menu = menu::create_menu(app.handle())?;
            app.set_menu(menu)?;

            #[cfg(any(
                target_os = "linux",
                target_os = "dragonfly",
                target_os = "freebsd",
                target_os = "netbsd",
                target_os = "openbsd"
            ))]
            linux_window_chrome::hide_application_menubar(app.handle());

            // Handle menu events
            app.on_menu_event(|_window, event| {
                let id = event.id();
                // MenuId is a tuple struct with a String field
                let id_str = &id.0;
                menu::handle_menu_event(_window.app_handle(), id_str);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            // Workspace commands
            features::workspace::management::commands::create_workspace,
            features::workspace::management::commands::get_workspaces,
            features::workspace::management::commands::update_workspace,
            features::workspace::management::commands::delete_workspace,
            // Chat commands
            features::chat::commands::create_chat,
            features::chat::commands::get_chats,
            features::chat::commands::update_chat,
            features::chat::commands::delete_chat,
            features::chat::commands::get_or_create_specialist_session,
            features::chat::commands::delete_all_chats_by_workspace,
            features::chat::commands::send_message,
            features::chat::commands::generate_chat_title,
            features::chat::commands::edit_and_resend_message,
            features::conversation::commands::get_conversation_state,
            features::conversation::commands::get_active_conversations,
            features::chat::commands::respond_tool_permission,
            features::chat::commands::respond_user_question,
            // Message commands
            features::message::commands::create_message,
            features::message::commands::get_messages,
            features::message::commands::update_message,
            features::message::commands::delete_messages_after,
            features::message::commands::cancel_message,
            // Chat Input Settings commands
            features::chat::input_settings::commands::get_chat_input_settings,
            features::chat::input_settings::commands::save_chat_input_settings,
            // Workspace Settings commands
            features::workspace::settings::commands::save_workspace_settings,
            features::workspace::settings::commands::get_workspace_settings,
            // LLM Connection commands
            features::llm_connection::commands::create_llm_connection,
            features::llm_connection::commands::get_llm_connections,
            features::llm_connection::commands::update_llm_connection,
            features::llm_connection::commands::delete_llm_connection,
            features::llm_connection::commands::test_llm_connection,
            // MCP Server Connection commands
            features::mcp_connection::commands::create_mcp_server_connection,
            features::mcp_connection::commands::get_mcp_server_connections,
            features::mcp_connection::commands::update_mcp_server_connection,
            features::mcp_connection::commands::delete_mcp_server_connection,
            features::mcp_connection::commands::update_mcp_server_status,
            // App Settings commands
            features::app_settings::commands::save_app_setting,
            features::app_settings::commands::get_app_setting,
            features::app_settings::commands::get_all_app_settings,
            // Web Search commands
            features::web_search::commands::test_web_search_connection,
            // MCP Tools commands
            features::tool::commands::test_mcp_connection_and_fetch_tools,
            features::tool::commands::connect_mcp_server_and_fetch_tools,
            features::tool::commands::get_mcp_client,
            features::tool::commands::call_mcp_tool,
            features::tool::commands::disconnect_mcp_client,
            features::tool::commands::get_active_tools_for_workspace,
            // Python commands
            features::runtime::python::commands::get_python_runtimes_status,
            features::runtime::python::commands::install_python_runtime,
            features::runtime::python::commands::uninstall_python_runtime,
            features::runtime::python::commands::execute_python_code,
            features::runtime::python::commands::install_python_packages,
            // Node commands
            features::runtime::node::commands::get_node_runtimes_status,
            features::runtime::node::commands::install_node_runtime,
            features::runtime::node::commands::uninstall_node_runtime,
            features::runtime::node::commands::install_node_packages,
            // Usage commands
            features::usage::commands::get_usage_summary,
            features::usage::commands::get_usage_logs,
            features::usage::commands::clear_usage,
            // Skill commands
            features::skill::commands::get_all_skills,
            features::skill::commands::load_skill,
            features::skill::commands::open_skills_folder,
            features::skill::commands::import_skill_from_github,
            features::skill::commands::delete_skill,
            // Note commands
            features::notes::commands::create_note,
            features::notes::commands::get_notes,
            features::notes::commands::update_note,
            features::notes::commands::delete_note,
            // Artifact commands
            features::artifacts::commands::get_artifacts,
            features::artifacts::commands::delete_artifact,
            // Browser commands
            features::browser::commands::browser_create_tab,
            features::browser::commands::browser_destroy_tab,
            features::browser::commands::browser_list_tabs,
            features::browser::commands::browser_get_active_tab,
            features::browser::commands::browser_set_active_tab,
            features::browser::commands::browser_create_fence_tab,
            features::browser::commands::browser_release_fence_tab,
            features::browser::commands::browser_release_fences_for_chat,
            features::browser::commands::browser_sync_bounds,
            features::browser::commands::browser_release_viewport,
            features::browser::commands::browser_navigate,
            features::browser::commands::browser_get_navigation_state,
            features::browser::commands::browser_go_back,
            features::browser::commands::browser_go_forward,
            features::browser::commands::browser_reload,
            features::browser::commands::path_to_file_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {name}! You've been greeted from Rust!")
}
