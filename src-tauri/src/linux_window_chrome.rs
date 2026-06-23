//! Linux frameless window: strip Tao's Wayland HeaderBar and hide the GTK menubar
//! so only the React custom TitleBar is visible.

use gtk::prelude::*;
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewWindow, Wry};

const STRIP_DELAYS_MS: &[u32] = &[0, 50, 150, 500];


pub fn hide_application_menubar(app: &AppHandle) {
    if let Err(error) = app.hide_menu() {
        log::warn!("Failed to hide GTK application menubar: {error}");
        return;
    }

    log::debug!("Hidden GTK menubar on Linux (keyboard shortcuts remain active)");

    let app_for_retry = app.clone();
    for delay_ms in [100_u32, 500] {
        let app = app_for_retry.clone();
        gtk::glib::timeout_add_local_once(Duration::from_millis(u64::from(delay_ms)), move || {
            let _ = app.hide_menu();
        });
    }

    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let app_for_map = app.clone();
    if let Ok(gtk_window) = window.gtk_window() {
        gtk_window.connect_map(move |_| {
            let _ = app_for_map.hide_menu();
        });
    }
}

fn hide_native_titlebar(window: &WebviewWindow<Wry>) {
    let _ = window.set_decorations(false);

    let Ok(gtk_window) = window.gtk_window() else {
        return;
    };

    gtk_window.set_decorated(false);

    if let Some(titlebar) = gtk_window.titlebar() {
        hide_widget_tree(&titlebar);
        gtk_window.queue_resize();
    }
}

fn hide_widget_tree(widget: &gtk::Widget) {
    widget.hide();
    widget.set_no_show_all(true);
    widget.set_size_request(0, 0);

    if let Ok(container) = widget.clone().downcast::<gtk::Container>() {
        for child in container.children() {
            hide_widget_tree(&child);
        }
    }
}
