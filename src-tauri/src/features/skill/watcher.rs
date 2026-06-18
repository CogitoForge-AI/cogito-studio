use super::sync_coordinator::SkillSyncCoordinator;
use crate::error::AppError;
use notify::event::{CreateKind, EventKind, ModifyKind, RemoveKind};
use notify::{RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;

const DEBOUNCE_TIMEOUT: Duration = Duration::from_secs(2);

pub struct SkillWatcher {
    _debouncer: Debouncer<notify::RecommendedWatcher, RecommendedCache>,
}

impl SkillWatcher {
    pub fn start(
        app: AppHandle,
        skills_dir: PathBuf,
        coordinator: Arc<SkillSyncCoordinator>,
    ) -> Result<Self, AppError> {
        let skills_dir_for_filter = skills_dir.clone();
        let coordinator_for_callback = Arc::clone(&coordinator);

        let mut debouncer = new_debouncer(
            DEBOUNCE_TIMEOUT,
            None,
            move |result: DebounceEventResult| {
                let Ok(events) = result else {
                    return;
                };

                let mut has_relevant = false;
                for debounced in events {
                    for event in debounced.event.paths {
                        if is_relevant_path(&event, &skills_dir_for_filter) {
                            has_relevant = true;
                            break;
                        }
                    }
                    if has_relevant {
                        break;
                    }
                }

                if has_relevant {
                    coordinator_for_callback.schedule_sync();
                }
            },
        )
        .map_err(|e| AppError::Generic(format!("Failed to start skill watcher: {e}")))?;

        debouncer
            .watch(&skills_dir, RecursiveMode::Recursive)
            .map_err(|e| AppError::Generic(format!("Failed to watch skills directory: {e}")))?;

        log::info!("Skill filesystem watcher started at {:?}", skills_dir);

        Ok(Self {
            _debouncer: debouncer,
        })
    }
}

fn is_relevant_path(path: &Path, skills_dir: &Path) -> bool {
    if is_ignored_path(path) {
        return false;
    }

    let Ok(rel) = path.strip_prefix(skills_dir) else {
        return false;
    };

    let components: Vec<_> = rel.components().collect();
    if components.is_empty() {
        return false;
    }

    // Direct child directory create/remove (new or deleted skill folder)
    if components.len() == 1 {
        return path.is_dir();
    }

    // SKILL.md or references under a skill folder
    if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
        if file_name == "SKILL.md" {
            return true;
        }
        if components.len() >= 2 {
            let first = components[0].as_os_str().to_string_lossy();
            if !first.starts_with('.') {
                if let Some(parent) = path.parent() {
                    if parent
                        .strip_prefix(skills_dir)
                        .ok()
                        .is_some_and(|p| p.components().count() == 1)
                    {
                        // Inside a direct skill child folder
                        if file_name == "SKILL.md" {
                            return true;
                        }
                        if path
                            .parent()
                            .and_then(|p| p.file_name())
                            .is_some_and(|n| n == "references")
                        {
                            return true;
                        }
                    }
                }
            }
        }
    }

    false
}

fn is_ignored_path(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default();

    if name.starts_with('.') {
        return true;
    }

    matches!(
        name,
        "Thumbs.db" | ".DS_Store" | "desktop.ini" | "__MACOSX"
    ) || name.ends_with('~')
        || name.ends_with(".swp")
        || name.ends_with(".tmp")
}

/// Filter by event kind — only structural changes.
#[allow(dead_code)]
fn is_relevant_event(kind: &EventKind, path: &Path, skills_dir: &Path) -> bool {
    if !is_relevant_path(path, skills_dir) {
        return false;
    }

    match kind {
        EventKind::Create(CreateKind::Folder) | EventKind::Remove(RemoveKind::Folder) => true,
        EventKind::Create(CreateKind::File) | EventKind::Modify(ModifyKind::Data(_)) => {
            path.file_name().is_some_and(|n| n == "SKILL.md")
        }
        EventKind::Remove(RemoveKind::File) => path.file_name().is_some_and(|n| n == "SKILL.md"),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn ignores_hidden_files() {
        let skills = PathBuf::from("/data/skills");
        let path = PathBuf::from("/data/skills/.DS_Store");
        assert!(!is_relevant_path(&path, &skills));
    }

    #[test]
    fn detects_skill_md() {
        let skills = PathBuf::from("/data/skills");
        let path = PathBuf::from("/data/skills/my-skill/SKILL.md");
        assert!(is_relevant_path(&path, &skills));
    }

    #[test]
    fn ignores_nested_unrelated_files() {
        let skills = PathBuf::from("/data/skills");
        let path = PathBuf::from("/data/skills/my-skill/scripts/run.sh");
        assert!(!is_relevant_path(&path, &skills));
    }
}
