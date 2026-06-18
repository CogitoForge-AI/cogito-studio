pub mod macos_probe;
use crate::error::AppError;
use crate::features::browser::factory::window_access;
use std::sync::Mutex;
use tauri::webview::WebviewBuilder;
use tauri::{AppHandle, Manager, Runtime};

pub struct ParentPlatformState {
    #[cfg(target_os = "macos")]
    /// Stable pointer to the main webview's WKWebViewConfiguration (leaked retain).
    macos_config_ptr: Option<usize>,
    #[cfg(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    ))]
    /// Stable pointer to the main webview's WebKitWebView (leaked ref).
    linux_webview_ptr: Option<usize>,
    initialized: bool,
}

impl Default for ParentPlatformState {
    fn default() -> Self {
        Self {
            #[cfg(target_os = "macos")]
            macos_config_ptr: None,
            #[cfg(any(
                target_os = "linux",
                target_os = "dragonfly",
                target_os = "freebsd",
                target_os = "netbsd",
                target_os = "openbsd"
            ))]
            linux_webview_ptr: None,
            initialized: false,
        }
    }
}

impl ParentPlatformState {
    pub fn init<R: Runtime>(app: &AppHandle<R>) -> Result<Self, AppError> {
        let mut state = Self::default();
        #[cfg(target_os = "macos")]
        {
            state.macos_config_ptr = Some(read_macos_config_ptr(app)?);
        }
        #[cfg(any(
            target_os = "linux",
            target_os = "dragonfly",
            target_os = "freebsd",
            target_os = "netbsd",
            target_os = "openbsd"
        ))]
        {
            state.linux_webview_ptr = Some(read_linux_webview_ptr(app)?);
        }
        state.initialized = true;
        Ok(state)
    }

    /// Re-read parent configuration if startup init ran before the main webview was ready.
    pub fn ensure_macos_config<R: Runtime>(&mut self, app: &AppHandle<R>) -> Result<(), AppError> {
        #[cfg(target_os = "macos")]
        {
            if self.macos_config_ptr.is_none() {
                self.macos_config_ptr = Some(read_macos_config_ptr(app)?);
            }
            self.initialized = true;
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = app;
        }
        Ok(())
    }

    /// Re-read the main webview handle if startup init ran before the main webview was ready.
    pub fn ensure_linux_related_view<R: Runtime>(
        &mut self,
        app: &AppHandle<R>,
    ) -> Result<(), AppError> {
        #[cfg(any(
            target_os = "linux",
            target_os = "dragonfly",
            target_os = "freebsd",
            target_os = "netbsd",
            target_os = "openbsd"
        ))]
        {
            if self.linux_webview_ptr.is_none() {
                self.linux_webview_ptr = Some(read_linux_webview_ptr(app)?);
            }
            self.initialized = true;
        }
        #[cfg(not(any(
            target_os = "linux",
            target_os = "dragonfly",
            target_os = "freebsd",
            target_os = "netbsd",
            target_os = "openbsd"
        )))]
        {
            let _ = app;
        }
        Ok(())
    }

    pub fn macos_config_ptr(&self) -> Option<usize> {
        #[cfg(target_os = "macos")]
        {
            self.macos_config_ptr
        }
        #[cfg(not(target_os = "macos"))]
        {
            None
        }
    }

    pub fn configure_builder<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        builder: WebviewBuilder<R>,
    ) -> Result<WebviewBuilder<R>, AppError> {
        #[cfg(target_os = "macos")]
        {
            let config_ptr = self
                .macos_config_ptr
                .or_else(|| read_macos_config_ptr(app).ok())
                .ok_or_else(|| {
                    AppError::Generic(
                        "macOS WKWebViewConfiguration unavailable; cannot create child webview"
                            .into(),
                    )
                })?;
            let config = macos_config_from_ptr(config_ptr)?;
            return Ok(builder.with_webview_configuration(config));
        }

        #[cfg(any(
            target_os = "linux",
            target_os = "dragonfly",
            target_os = "freebsd",
            target_os = "netbsd",
            target_os = "openbsd"
        ))]
        {
            let webview_ptr = self
                .linux_webview_ptr
                .or_else(|| read_linux_webview_ptr(app).ok())
                .ok_or_else(|| {
                    AppError::Generic(
                        "Linux WebKitWebView unavailable; cannot create child webview".into(),
                    )
                })?;
            let related = linux_webview_from_ptr(webview_ptr)?;
            return Ok(builder.with_related_view(related));
        }

        #[cfg(not(any(
            target_os = "macos",
            target_os = "linux",
            target_os = "dragonfly",
            target_os = "freebsd",
            target_os = "netbsd",
            target_os = "openbsd"
        )))]
        {
            let _ = app;
        }

        Ok(builder)
    }
}

/// Shared platform state cached at app setup.
pub type SharedPlatformState = Mutex<ParentPlatformState>;

#[cfg(target_os = "macos")]
fn read_macos_config_ptr<R: Runtime>(app: &AppHandle<R>) -> Result<usize, AppError> {
    use objc2::rc::Retained;
    use objc2_web_kit::WKWebView;
    use std::sync::mpsc::channel;

    let main = window_access::main_webview(app)?;

    let (tx, rx) = channel();
    main.with_webview(move |wv| {
        // SAFETY: `inner()` is the WKWebView pointer owned by the Tauri runtime.
        unsafe {
            let ptr = wv.inner().cast::<WKWebView>();
            if ptr.is_null() {
                let _ = tx.send(None);
                return;
            }
            let wk = &*ptr;
            let config = wk.configuration();
            let config_ptr = Retained::as_ptr(&config) as usize;
            // Keep one retain for the app lifetime so the pointer stays valid.
            std::mem::forget(config);
            let _ = tx.send(Some(config_ptr));
        }
    })
    .map_err(|e| AppError::Generic(format!("Failed to access main webview: {e}")))?;

    rx.recv()
        .map_err(|_| AppError::Generic("Failed to read main webview configuration".into()))?
        .ok_or_else(|| AppError::Generic("Main WKWebView is unavailable".into()))
}

#[cfg(target_os = "macos")]
pub(crate) fn macos_config_from_ptr(
    config_ptr: usize,
) -> Result<objc2::rc::Retained<objc2_web_kit::WKWebViewConfiguration>, AppError> {
    use objc2::rc::Retained;
    use objc2_web_kit::WKWebViewConfiguration;

    if config_ptr == 0 {
        return Err(AppError::Generic(
            "Cached WKWebViewConfiguration pointer is null".into(),
        ));
    }

    // SAFETY: pointer came from the main webview configuration and is kept alive via leaked retain.
    unsafe {
        Retained::retain(config_ptr as *mut WKWebViewConfiguration).ok_or_else(|| {
            AppError::Generic("Failed to retain main WKWebViewConfiguration".into())
        })
    }
}

#[cfg(any(
    target_os = "linux",
    target_os = "dragonfly",
    target_os = "freebsd",
    target_os = "netbsd",
    target_os = "openbsd"
))]
fn read_linux_webview_ptr<R: Runtime>(app: &AppHandle<R>) -> Result<usize, AppError> {
    use std::sync::mpsc::channel;
    use webkit2gtk::glib::prelude::*;

    let main = window_access::main_webview(app)?;

    let (tx, rx) = channel::<Option<usize>>();
    main.with_webview(move |wv| {
        let view = wv.inner();
        let cloned = view.clone();
        let ptr = cloned.as_ptr() as usize;
        // Keep one ref for the app lifetime so the pointer stays valid.
        std::mem::forget(cloned);
        let _ = tx.send(Some(ptr));
    })
    .map_err(|e| AppError::Generic(format!("Failed to access main webview: {e}")))?;

    rx.recv()
        .map_err(|_| AppError::Generic("Failed to read main webview handle".into()))?
        .ok_or_else(|| AppError::Generic("Main WebKitWebView is unavailable".into()))
}

#[cfg(any(
    target_os = "linux",
    target_os = "dragonfly",
    target_os = "freebsd",
    target_os = "netbsd",
    target_os = "openbsd"
))]
fn linux_webview_from_ptr(ptr: usize) -> Result<webkit2gtk::WebView, AppError> {
    use webkit2gtk::glib::translate::FromGlibPtrNone;

    if ptr == 0 {
        return Err(AppError::Generic(
            "Cached WebKitWebView pointer is null".into(),
        ));
    }

    // SAFETY: pointer came from the main webview and is kept alive via leaked ref.
    unsafe {
        Ok(webkit2gtk::WebView::from_glib_none(
            ptr as *mut webkit2gtk::ffi::WebKitWebView,
        ))
    }
}
