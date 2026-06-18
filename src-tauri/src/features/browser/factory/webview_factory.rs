use crate::constants::events::TauriEvents;
use crate::error::AppError;
use crate::events::{
    BrowserActiveTabChangedEvent, BrowserNavigatedEvent, BrowserTabCreatedEvent,
    BrowserTabDestroyedEvent, BrowserTitleChangedEvent,
};
use crate::features::browser::eval_helper;
use crate::features::browser::factory::history::HistoryState;
use crate::features::browser::factory::instance::{TabKind, TabSummary, WebviewInstance};
use crate::features::browser::factory::lease::{ViewportId, ViewportKind, ViewportLeaseManager};
use crate::features::browser::factory::lifecycle::WebviewLifecycle;
use crate::features::browser::factory::platform::macos_probe;
use crate::features::browser::factory::window_access;
use crate::features::browser::factory::platform::{ParentPlatformState, SharedPlatformState};
use crate::features::browser::factory::safe_child;
use crate::features::browser::factory::registry::WebviewRegistry;
use crate::features::browser::models::{validate_url, BrowserNavigationState};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder};
use tauri::utils::config::WebviewUrl;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, Webview};
use uuid::Uuid;

pub struct WebviewFactory {
    app: Arc<AppHandle>,
    registry: Arc<Mutex<WebviewRegistry>>,
    leases: Arc<Mutex<ViewportLeaseManager>>,
    platform: Arc<SharedPlatformState>,
}

impl WebviewFactory {
    pub fn new(app: Arc<AppHandle>) -> Self {
        Self {
            app,
            registry: Arc::new(Mutex::new(WebviewRegistry::default())),
            leases: Arc::new(Mutex::new(ViewportLeaseManager::default())),
            platform: Arc::new(std::sync::Mutex::new(ParentPlatformState::default())),
        }
    }

    pub fn init_platform(&self) -> Result<(), AppError> {
        let state = ParentPlatformState::init(&self.app)?;
        *self
            .platform
            .lock()
            .map_err(|_| AppError::Generic("Browser platform lock poisoned".into()))? = state;
        Ok(())
    }

    pub async fn create_panel_tab(&self, url: Option<String>) -> Result<String, AppError> {
        self.create_tab_inner(TabKind::Panel, None, None, url).await
    }

    pub async fn create_fence_tab(
        &self,
        anchor_id: String,
        chat_id: Option<String>,
        url: String,
    ) -> Result<String, AppError> {
        if let Some(existing) = self.registry.lock().await.tab_id_for_anchor(&anchor_id) {
            self.navigate(&existing, &url).await?;
            return Ok(existing);
        }
        self.create_tab_inner(TabKind::Fence, Some(anchor_id), chat_id, Some(url))
            .await
    }

    pub async fn destroy_panel_tab(&self, tab_id: &str) -> Result<(), AppError> {
        let tab = self
            .registry
            .lock()
            .await
            .get(tab_id)
            .ok_or_else(|| AppError::NotFound(format!("Browser tab not found: {tab_id}")))?;
        if tab.kind != TabKind::Panel {
            return Err(AppError::Validation(
                "Only panel tabs can be destroyed from the tab bar".into(),
            ));
        }
        self.destroy_tab_inner(tab_id).await
    }

    pub async fn release_fence_tab(&self, anchor_id: &str) -> Result<(), AppError> {
        let tab_id = self
            .registry
            .lock()
            .await
            .tab_id_for_anchor(anchor_id)
            .ok_or_else(|| AppError::NotFound(format!("Fence tab not found: {anchor_id}")))?;
        self.destroy_tab_inner(&tab_id).await
    }

    pub async fn release_fences_for_chat(&self, chat_id: &str) -> Result<(), AppError> {
        let tab_ids = self.registry.lock().await.fence_tab_ids_for_chat(chat_id);
        for tab_id in tab_ids {
            let _ = self.destroy_tab_inner(&tab_id).await;
        }
        Ok(())
    }

    pub async fn list_panel_tabs(&self) -> Result<Vec<TabSummary>, AppError> {
        let registry = self.registry.lock().await;
        let nav_states = self.collect_nav_states(&registry).await;
        Ok(registry.list_panel_summaries(&nav_states))
    }

    pub async fn get_active_tab(&self) -> Option<String> {
        self.registry
            .lock()
            .await
            .active_tab_id()
            .cloned()
    }

    pub async fn set_active_tab(&self, tab_id: &str) -> Result<(), AppError> {
        let other_panel_tabs: Vec<String> = {
            let registry = self.registry.lock().await;
            if !registry
                .get(tab_id)
                .is_some_and(|tab| tab.kind == TabKind::Panel)
            {
                return Err(AppError::NotFound(format!(
                    "Panel tab not found: {tab_id}"
                )));
            }
            registry
                .panel_tab_ids()
                .iter()
                .filter(|id| id.as_str() != tab_id)
                .cloned()
                .collect()
        };

        for other_id in other_panel_tabs {
            self.hide_tab_webview(&other_id).await;
        }

        let mut registry = self.registry.lock().await;
        registry.set_active_tab(tab_id);
        let _ = self.app.emit(
            TauriEvents::BROWSER_ACTIVE_TAB_CHANGED,
            BrowserActiveTabChangedEvent {
                tab_id: tab_id.to_string(),
            },
        );
        Ok(())
    }

    pub async fn navigate(&self, tab_id: &str, url: &str) -> Result<(), AppError> {
        let validated = validate_url(url)?;
        let tab = self.get_tab(tab_id).await?;
        let webview = self.get_webview(&tab)?;
        let parsed = parse_nav_url(&validated)?;

        webview
            .navigate(parsed)
            .map_err(|e| AppError::Generic(format!("Navigate failed: {e}")))?;

        {
            let mut history = tab.history.lock().await;
            history.push(validated.clone());
        }
        self.update_nav_state(&tab, validated.clone(), None).await;

        let _ = self.app.emit(
            TauriEvents::BROWSER_NAVIGATED,
            BrowserNavigatedEvent {
                tab_id: tab_id.to_string(),
                url: validated,
            },
        );
        Ok(())
    }

    pub async fn get_navigation_state(
        &self,
        tab_id: &str,
    ) -> Result<BrowserNavigationState, AppError> {
        let tab = self.get_tab(tab_id).await?;
        let state = tab.nav_state.lock().await.clone();
        Ok(state)
    }

    pub async fn go_back(&self, tab_id: &str) -> Result<BrowserNavigationState, AppError> {
        let tab = self.get_tab(tab_id).await?;
        let webview = self.get_webview(&tab)?;

        {
            let mut history = tab.history.lock().await;
            if history.go_back().is_none() {
                return Ok(tab.nav_state.lock().await.clone());
            }
        }

        webview
            .eval("history.back()")
            .map_err(|e| AppError::Generic(format!("Go back failed: {e}")))?;

        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
        self.refresh_nav_state(&tab).await
    }

    pub async fn go_forward(&self, tab_id: &str) -> Result<BrowserNavigationState, AppError> {
        let tab = self.get_tab(tab_id).await?;
        let webview = self.get_webview(&tab)?;

        {
            let mut history = tab.history.lock().await;
            if history.go_forward().is_none() {
                return Ok(tab.nav_state.lock().await.clone());
            }
        }

        webview
            .eval("history.forward()")
            .map_err(|e| AppError::Generic(format!("Go forward failed: {e}")))?;

        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
        self.refresh_nav_state(&tab).await
    }

    pub async fn reload(&self, tab_id: &str) -> Result<(), AppError> {
        let tab = self.get_tab(tab_id).await?;
        let webview = self.get_webview(&tab)?;
        webview
            .reload()
            .map_err(|e| AppError::Generic(format!("Reload failed: {e}")))
    }

    pub async fn sync_bounds(
        &self,
        viewport: ViewportId,
        tab_id: &str,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        visible: bool,
    ) -> Result<(), AppError> {
        let tab = self.get_tab(tab_id).await?;
        let webview = self.get_webview(&tab)?;

        if visible && width >= 1.0 && height >= 1.0 {
            let previous_lease = self
                .leases
                .lock()
                .await
                .set_lease(viewport.clone(), tab_id.to_string());

            if viewport.kind == ViewportKind::MainPanel
            {
                let other_panel_tabs: Vec<String> = self
                    .registry
                    .lock()
                    .await
                    .panel_tab_ids()
                    .iter()
                    .filter(|id| id.as_str() != tab_id)
                    .cloned()
                    .collect();
                for other_id in other_panel_tabs {
                    self.hide_tab_webview(&other_id).await;
                }
            } else if let Some(previous) = previous_lease {
                if previous != tab_id {
                    self.hide_tab_webview(&previous).await;
                }
            }
        }

        if !visible || width < 1.0 || height < 1.0 {
            let _ = webview.hide();
            let mut life = tab.lifecycle.lock().await;
            *life = WebviewLifecycle::Hidden;
            return Ok(());
        }

        webview
            .set_position(LogicalPosition::new(x, y))
            .map_err(|e| AppError::Generic(e.to_string()))?;
        webview
            .set_size(LogicalSize::new(width, height))
            .map_err(|e| AppError::Generic(e.to_string()))?;
        webview
            .show()
            .map_err(|e| AppError::Generic(e.to_string()))?;
        let mut life = tab.lifecycle.lock().await;
        *life = WebviewLifecycle::Visible;
        Ok(())
    }

    pub async fn release_viewport(&self, viewport: ViewportId) -> Result<(), AppError> {
        if let Some(tab_id) = self.leases.lock().await.release(&viewport) {
            if let Some(tab) = self.registry.lock().await.get(&tab_id) {
                if let Ok(webview) = self.get_webview(&tab) {
                    let _ = webview.hide();
                }
                let mut life = tab.lifecycle.lock().await;
                *life = WebviewLifecycle::Hidden;
            }
        }
        Ok(())
    }

    pub async fn capture_screenshot(&self, tab_id: &str) -> Result<String, AppError> {
        let tab = self.get_tab(tab_id).await?;
        let webview = self.get_webview(&tab)?;
        let script = r#"
            (function() {
              const canvas = document.createElement('canvas');
              const width = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
              const height = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (!ctx) return JSON.stringify({ error: 'canvas unavailable' });
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, width, height);
              return JSON.stringify({ data: canvas.toDataURL('image/jpeg', 0.85).split(',')[1] || '' });
            })()
        "#;
        let raw = eval_helper::eval_json(&webview, script)?;
        let value: serde_json::Value = serde_json::from_str(&raw)
            .map_err(|e| AppError::Generic(format!("Screenshot parse failed: {e}")))?;
        if let Some(data) = value.get("data").and_then(|v| v.as_str()) {
            if !data.is_empty() {
                return Ok(data.to_string());
            }
        }
        Err(AppError::Generic(
            value
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("Screenshot capture failed")
                .to_string(),
        ))
    }

    pub async fn get_page_text(&self, tab_id: &str, max_chars: usize) -> Result<String, AppError> {
        let tab = self.get_tab(tab_id).await?;
        let webview = self.get_webview(&tab)?;
        let script = format!("document.body?.innerText?.slice(0, {max_chars}) ?? ''");
        let raw = eval_helper::eval_json(&webview, &script)?;
        serde_json::from_str(&raw).map_err(|e| AppError::Generic(format!("Text parse failed: {e}")))
    }

    pub async fn get_page_title(&self, tab_id: &str) -> Result<String, AppError> {
        let tab = self.get_tab(tab_id).await?;
        let title = tab.nav_state.lock().await.title.clone();
        Ok(title)
    }

    pub async fn click_selector(&self, tab_id: &str, selector: &str) -> Result<(), AppError> {
        let tab = self.get_tab(tab_id).await?;
        let webview = self.get_webview(&tab)?;
        let script = format!(
            r#"(function() {{
                const el = document.querySelector({selector:?});
                if (!el) throw new Error('Element not found');
                el.scrollIntoView({{ block: 'center', inline: 'center' }});
                el.click();
                return true;
            }})()"#
        );
        webview
            .eval(&script)
            .map_err(|e| AppError::Generic(format!("Click failed: {e}")))
    }

    pub async fn type_text(&self, tab_id: &str, text: &str) -> Result<(), AppError> {
        let tab = self.get_tab(tab_id).await?;
        let webview = self.get_webview(&tab)?;
        let escaped = serde_json::to_string(text)
            .map_err(|e| AppError::Generic(format!("Text escape failed: {e}")))?;
        let script = format!(
            r#"(function() {{
                const text = {escaped};
                const el = document.activeElement;
                if (!el) throw new Error('No focused element');
                if (el.isContentEditable) {{
                  document.execCommand('insertText', false, text);
                  return true;
                }}
                if ('value' in el) {{
                  const start = el.selectionStart ?? el.value.length;
                  const end = el.selectionEnd ?? el.value.length;
                  el.value = el.value.slice(0, start) + text + el.value.slice(end);
                  el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                  return true;
                }}
                document.execCommand('insertText', false, text);
                return true;
            }})()"#
        );
        webview
            .eval(&script)
            .map_err(|e| AppError::Generic(format!("Type failed: {e}")))
    }

    pub async fn resolve_panel_tab(&self, tab_id: Option<&str>) -> Result<String, AppError> {
        if let Some(id) = tab_id {
            self.get_tab(id).await?;
            return Ok(id.to_string());
        }
        if let Some(active) = self.get_active_tab().await {
            return Ok(active);
        }
        Err(AppError::Validation(
            "No active browser tab. Open or create a tab first.".into(),
        ))
    }

    async fn create_tab_inner(
        &self,
        kind: TabKind,
        anchor_id: Option<String>,
        chat_id: Option<String>,
        url: Option<String>,
    ) -> Result<String, AppError> {
        let tab_id = Uuid::new_v4().to_string();
        let webview_label = format!("browser-{tab_id}");
        let profile_dir = self.tab_profile_dir(&tab_id)?;
        std::fs::create_dir_all(&profile_dir)?;

        let initial_url = url
            .as_deref()
            .map(validate_url)
            .transpose()?
            .unwrap_or_else(|| "about:blank".to_string());

        let parsed_url = parse_nav_url(&initial_url)?;
        let nav_state = Arc::new(Mutex::new(BrowserNavigationState {
            url: initial_url.clone(),
            title: String::new(),
            can_go_back: false,
            can_go_forward: false,
        }));
        let history = Arc::new(Mutex::new(HistoryState::new(initial_url.clone())));

        let window = window_access::main_window(&self.app)?;

        let app_handle = self.app.clone();
        let tab_id_for_events = tab_id.clone();
        let nav_state_for_page = nav_state.clone();
        let history_for_page = history.clone();
        let nav_state_for_title = nav_state.clone();
        let app_for_new_window = self.app.clone();
        let tab_id_for_new_window = tab_id.clone();
        let factory_app = self.app.clone();

        let builder = WebviewBuilder::new(&webview_label, WebviewUrl::External(parsed_url));
        #[cfg(not(target_os = "macos"))]
        let builder = builder.data_directory(profile_dir.clone());
        let builder = builder
            .on_navigation({
                let app = app_handle.clone();
                let tab_id = tab_id_for_events.clone();
                move |url| is_allowed_navigation(&app, &tab_id, url)
            })
            .on_page_load({
                let app = app_handle.clone();
                let tab_id = tab_id_for_events.clone();
                let nav_state = nav_state_for_page.clone();
                let history = history_for_page.clone();
                move |_webview, payload| {
                    if payload.event() != PageLoadEvent::Finished {
                        return;
                    }
                    let url = payload.url().to_string();
                    let app = app.clone();
                    let tab_id = tab_id.clone();
                    let nav_state = nav_state.clone();
                    let history = history.clone();
                    tauri::async_runtime::spawn(async move {
                        {
                            let mut hist = history.lock().await;
                            hist.push(url.clone());
                        }
                        let (can_go_back, can_go_forward) = {
                            let hist = history.lock().await;
                            (hist.can_go_back(), hist.can_go_forward())
                        };
                        let title = {
                            let mut state = nav_state.lock().await;
                            state.url = url.clone();
                            state.can_go_back = can_go_back;
                            state.can_go_forward = can_go_forward;
                            state.title.clone()
                        };
                        let _ = app.emit(
                            TauriEvents::BROWSER_NAVIGATED,
                            BrowserNavigatedEvent {
                                tab_id: tab_id.clone(),
                                url: url.clone(),
                            },
                        );
                        if !title.is_empty() {
                            let _ = app.emit(
                                TauriEvents::BROWSER_TITLE_CHANGED,
                                BrowserTitleChangedEvent { tab_id, title },
                            );
                        }
                    });
                }
            })
            .on_document_title_changed({
                let app = factory_app.clone();
                let tab_id = tab_id_for_events.clone();
                move |_webview, title| {
                    let nav_state = nav_state_for_title.clone();
                    let app = app.clone();
                    let tab_id = tab_id.clone();
                    tauri::async_runtime::spawn(async move {
                        {
                            let mut state = nav_state.lock().await;
                            state.title = title.clone();
                        }
                        let _ = app.emit(
                            TauriEvents::BROWSER_TITLE_CHANGED,
                            BrowserTitleChangedEvent { tab_id, title },
                        );
                    });
                }
            })
            .on_new_window({
                move |url, _features| {
                    if let Ok(validated) = validate_url(url.as_str()) {
                        let app = app_for_new_window.clone();
                        let tab_id = tab_id_for_new_window.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Some(state) = app.try_state::<crate::state::AppState>() {
                                let _ = state
                                    .browser_service
                                    .navigate(Some(&tab_id), &validated)
                                    .await;
                            }
                        });
                    }
                    NewWindowResponse::Deny
                }
            });

        let builder = {
            let mut platform = self
                .platform
                .lock()
                .map_err(|_| AppError::Generic("Browser platform lock poisoned".into()))?;
            platform.ensure_macos_config(&self.app)?;
            platform.ensure_linux_related_view(&self.app)?;
            platform.configure_builder(&self.app, builder)?
        };

        #[cfg(target_os = "macos")]
        if let Some(config_ptr) = {
            let platform = self
                .platform
                .lock()
                .map_err(|_| AppError::Generic("Browser platform lock poisoned".into()))?;
            platform.macos_config_ptr()
        } {
            macos_probe::validate_child_webview_capability(&self.app, config_ptr)?;
        }

        let webview = safe_child::try_add_child(
            &window,
            builder,
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(1.0, 1.0),
        )?;

        let _ = webview.hide();

        let instance = Arc::new(WebviewInstance {
            tab_id: tab_id.clone(),
            kind: kind.clone(),
            anchor_id: anchor_id.clone(),
            chat_id: chat_id.clone(),
            webview_label,
            data_dir: profile_dir,
            lifecycle: Mutex::new(WebviewLifecycle::Ready),
            nav_state,
            history,
        });

        self.registry.lock().await.insert(instance);

        let kind_for_event = kind.clone();
        let _ = self.app.emit(
            TauriEvents::BROWSER_TAB_CREATED,
            BrowserTabCreatedEvent {
                tab_id: tab_id.clone(),
                kind: kind_for_event,
                url: Some(initial_url),
                anchor_id,
                chat_id,
            },
        );

        if matches!(kind, TabKind::Panel) {
            let _ = self.set_active_tab(&tab_id).await;
        }

        Ok(tab_id)
    }

    async fn destroy_tab_inner(&self, tab_id: &str) -> Result<(), AppError> {
        let tab = self.registry.lock().await.remove(tab_id);

        if let Some(tab) = tab {
            if let Ok(webview) = self.get_webview(&tab) {
                let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    let _ = webview.close();
                }));
            }
            let _ = std::fs::remove_dir_all(&tab.data_dir);
        }

        let _ = self.app.emit(
            TauriEvents::BROWSER_TAB_DESTROYED,
            BrowserTabDestroyedEvent {
                tab_id: tab_id.to_string(),
            },
        );
        Ok(())
    }

    async fn get_tab(&self, tab_id: &str) -> Result<Arc<WebviewInstance>, AppError> {
        self.registry
            .lock()
            .await
            .get(tab_id)
            .ok_or_else(|| AppError::NotFound(format!("Browser tab not found: {tab_id}")))
    }

    async fn hide_tab_webview(&self, tab_id: &str) {
        let tab = {
            let registry = self.registry.lock().await;
            registry.get(tab_id)
        };
        let Some(tab) = tab else {
            return;
        };
        if let Ok(webview) = self.get_webview(&tab) {
            let _ = webview.hide();
            let mut life = tab.lifecycle.lock().await;
            *life = WebviewLifecycle::Hidden;
        }
    }

    fn get_webview(&self, tab: &WebviewInstance) -> Result<Webview, AppError> {
        self.app
            .get_webview(&tab.webview_label)
            .ok_or_else(|| {
                AppError::NotFound(format!(
                    "Browser webview not found: {}",
                    tab.webview_label
                ))
            })
    }

    fn tab_profile_dir(&self, tab_id: &str) -> Result<PathBuf, AppError> {
        let app_data = self
            .app
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Generic(e.to_string()))?;
        Ok(app_data.join("browser-tabs").join(tab_id))
    }

    async fn refresh_nav_state(
        &self,
        tab: &WebviewInstance,
    ) -> Result<BrowserNavigationState, AppError> {
        let webview = self.get_webview(tab)?;
        let raw = eval_helper::eval_json(
            &webview,
            r#"({ url: location.href, title: document.title })"#,
        )?;
        let value: serde_json::Value = serde_json::from_str(&raw)
            .map_err(|e| AppError::Generic(format!("Navigation state parse failed: {e}")))?;
        let url = value
            .get("url")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let title = value
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        self.update_nav_state(tab, url.clone(), Some(title)).await;
        let _ = self.app.emit(
            TauriEvents::BROWSER_NAVIGATED,
            BrowserNavigatedEvent {
                tab_id: tab.tab_id.clone(),
                url,
            },
        );
        Ok(tab.nav_state.lock().await.clone())
    }

    async fn update_nav_state(
        &self,
        tab: &WebviewInstance,
        url: String,
        title: Option<String>,
    ) {
        let history = tab.history.lock().await;
        let mut state = tab.nav_state.lock().await;
        state.url = url;
        if let Some(title) = title {
            state.title = title;
        }
        state.can_go_back = history.can_go_back();
        state.can_go_forward = history.can_go_forward();
    }

    async fn collect_nav_states(
        &self,
        registry: &WebviewRegistry,
    ) -> HashMap<String, BrowserNavigationState> {
        let mut map = HashMap::new();
        for id in registry.panel_tab_ids().iter() {
            if let Some(tab) = registry.get(id) {
                map.insert(id.clone(), tab.nav_state.lock().await.clone());
            }
        }
        map
    }
}

fn parse_nav_url(url: &str) -> Result<Url, AppError> {
    if url == "about:blank" {
        return Ok(Url::parse("about:blank").expect("about:blank is valid"));
    }
    Url::parse(url).map_err(|e| AppError::Generic(format!("Invalid URL: {e}")))
}

fn is_allowed_navigation(_app: &AppHandle, tab_id: &str, url: &Url) -> bool {
    if url.scheme() == "about" {
        return true;
    }
    match validate_url(url.as_str()) {
        Ok(_) => true,
        Err(err) => {
            tracing::warn!("Blocked navigation for tab {tab_id}: {err}");
            false
        }
    }
}
