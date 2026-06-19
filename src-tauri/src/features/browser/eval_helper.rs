use crate::error::AppError;
use std::sync::mpsc::{sync_channel, RecvTimeoutError};
use std::time::Duration;
use tauri::webview::PlatformWebview;
use tauri::Webview;

const EVAL_TIMEOUT: Duration = Duration::from_secs(15);

pub fn eval_string(webview: &Webview, script: &str) -> Result<String, AppError> {
    let (tx, rx) = sync_channel(1);
    let script = script.to_string();
    webview
        .with_webview(move |platform| {
            let result = platform_eval(&platform, &script);
            let _ = tx.send(result);
        })
        .map_err(|e| AppError::Generic(format!("eval failed: {e}")))?;

    match rx.recv_timeout(EVAL_TIMEOUT) {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(err)) => Err(AppError::Generic(err)),
        Err(RecvTimeoutError::Timeout) => Err(AppError::Generic("JavaScript eval timed out".into())),
        Err(RecvTimeoutError::Disconnected) => {
            Err(AppError::Generic("JavaScript eval channel closed".into()))
        }
    }
}

fn platform_eval(platform: &PlatformWebview, script: &str) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        return eval_macos(platform, script);
    }
    #[cfg(windows)]
    {
        return eval_windows(platform, script);
    }
    #[cfg(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    ))]
    {
        return eval_linux(platform, script);
    }
    #[cfg(not(any(
        target_os = "macos",
        windows,
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    )))]
    {
        let _ = (platform, script);
        Err("JavaScript eval is not supported on this platform".into())
    }
}

#[cfg(target_os = "macos")]
fn eval_macos(platform: &PlatformWebview, script: &str) -> Result<String, String> {
    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2_foundation::{NSError, NSString};
    use objc2_web_kit::WKWebView;
    use std::sync::{Arc, Condvar, Mutex};

    let pair = Arc::new((Mutex::new(None), Condvar::new()));
    let pair2 = pair.clone();

    unsafe {
        let view: &WKWebView = &*platform.inner().cast();
        let ns_script = NSString::from_str(script);
        let block = RcBlock::new(move |result: *mut AnyObject, error: *mut NSError| {
            let mut guard = pair2.0.lock().unwrap();
            if let Some(err) = error.as_ref() {
                *guard = Some(Err(err.localizedDescription().to_string()));
            } else if result.is_null() {
                *guard = Some(Ok(String::new()));
            } else if let Some(ns) = Retained::retain(result.cast::<NSString>()) {
                *guard = Some(Ok(ns.to_string()));
            } else {
                *guard = Some(Ok(String::new()));
            }
            pair2.1.notify_one();
        });
        view.evaluateJavaScript_completionHandler(&ns_script, Some(&block));
    }

    let (lock, cvar) = &*pair;
    let mut guard = lock.lock().unwrap();
    while guard.is_none() {
        guard = cvar
            .wait_timeout_while(guard, EVAL_TIMEOUT, |value| value.is_none())
            .unwrap()
            .0;
    }
    guard.take().unwrap_or_else(|| Err("eval cancelled".into()))
}

#[cfg(windows)]
fn eval_windows(platform: &PlatformWebview, script: &str) -> Result<String, String> {
    use std::sync::{Arc, Condvar, Mutex};
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;
    use windows::core::HSTRING;

    let pair = Arc::new((Mutex::new(None), Condvar::new()));
    let pair2 = pair.clone();
    let script = script.to_string();

    unsafe {
        let controller = platform.controller();
        let webview: ICoreWebView2 = controller
            .CoreWebView2()
            .map_err(|e| format!("CoreWebView2 failed: {e}"))?;

        let handler = webview2_com::ExecuteScriptCompletedHandler::create(Box::new(
            move |error_code, result_json| {
                let mut guard = pair2.0.lock().unwrap();
                *guard = Some(
                    error_code
                        .map(|()| result_json)
                        .map_err(|e| format!("ExecuteScript failed: {e}")),
                );
                pair2.1.notify_one();
                Ok(())
            },
        ));

        webview
            .ExecuteScript(&HSTRING::from(script.as_str()), &handler)
            .map_err(|e| format!("ExecuteScript invoke failed: {e}"))?;
    }

    let (lock, cvar) = &*pair;
    let mut guard = lock.lock().unwrap();
    while guard.is_none() {
        guard = cvar
            .wait_timeout_while(guard, EVAL_TIMEOUT, |value| value.is_none())
            .unwrap()
            .0;
    }
    guard.take().unwrap_or_else(|| Err("eval cancelled".into()))
}

#[cfg(any(
    target_os = "linux",
    target_os = "dragonfly",
    target_os = "freebsd",
    target_os = "netbsd",
    target_os = "openbsd"
))]
fn eval_linux(platform: &PlatformWebview, script: &str) -> Result<String, String> {
    use javascriptcore::auto::value::ValueExt;
    use std::sync::{Arc, Condvar, Mutex};
    use webkit2gtk::WebViewExt;

    let pair = Arc::new((Mutex::new(None), Condvar::new()));
    let pair2 = pair.clone();
    let script = script.to_string();

    platform.inner().run_javascript(
        &script,
        None::<&webkit2gtk::gio::Cancellable>,
        move |result| {
            let parsed = match result {
                Ok(js_result) => {
                    let js = js_result
                        .js_value()
                        .and_then(|value| value.to_json(0))
                        .map(|value| value.to_string())
                        .unwrap_or_default();
                    Ok(js)
                }
                Err(err) => Err(format!("JavaScript eval failed: {err}")),
            };
            let mut guard = pair2.0.lock().unwrap();
            *guard = Some(parsed);
            pair2.1.notify_one();
        },
    );

    let (lock, cvar) = &*pair;
    let mut guard = lock.lock().unwrap();
    while guard.is_none() {
        guard = cvar
            .wait_timeout_while(guard, EVAL_TIMEOUT, |value| value.is_none())
            .unwrap()
            .0;
    }
    guard.take().unwrap_or_else(|| Err("eval cancelled".into()))
}

pub fn eval_json(webview: &Webview, expression: &str) -> Result<String, AppError> {
    let script = format!(
        "(function(){{try{{return JSON.stringify({expression});}}catch(e){{return JSON.stringify({{error:String(e)}});}}}})()"
    );
    let raw = eval_string(webview, &script)?;
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) {
        if let Some(err) = value.get("error").and_then(|v| v.as_str()) {
            return Err(AppError::Generic(err.to_string()));
        }
    }
    Ok(raw)
}
