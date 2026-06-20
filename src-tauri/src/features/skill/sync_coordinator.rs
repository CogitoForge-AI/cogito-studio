use super::service::SkillService;
use crate::constants::events::TauriEvents;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const EMIT_THROTTLE: Duration = Duration::from_secs(2);

pub struct SkillSyncCoordinator {
    paused: AtomicBool,
    sync_in_progress: AtomicBool,
    sync_pending: AtomicBool,
    last_emit: Mutex<Instant>,
    coalesced_emit: AtomicBool,
    skill_service: Arc<SkillService>,
    app: AppHandle,
}

impl SkillSyncCoordinator {
    pub fn new(skill_service: Arc<SkillService>, app: AppHandle) -> Self {
        Self {
            paused: AtomicBool::new(false),
            sync_in_progress: AtomicBool::new(false),
            sync_pending: AtomicBool::new(false),
            last_emit: Mutex::new(Instant::now().checked_sub(EMIT_THROTTLE).unwrap()),
            coalesced_emit: AtomicBool::new(false),
            skill_service,
            app,
        }
    }

    pub fn pause(&self) {
        self.paused.store(true, Ordering::SeqCst);
    }

    pub fn resume(&self) {
        self.paused.store(false, Ordering::SeqCst);
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::SeqCst)
    }

    /// Called after debounced filesystem events.
    pub fn schedule_sync(self: &Arc<Self>) {
        if self.paused.load(Ordering::SeqCst) {
            return;
        }

        if self
            .sync_in_progress
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            self.sync_pending.store(true, Ordering::SeqCst);
            return;
        }

        let coordinator = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            coordinator.run_sync().await;
        });
    }

    /// Manual sync after import (watcher paused).
    pub fn sync_now(self: &Arc<Self>) -> Result<bool, crate::error::AppError> {
        let before = self.skill_service.snapshot_skill_ids()?;
        self.skill_service.sync_skills_to_db()?;
        let after = self.skill_service.snapshot_skill_ids()?;
        let changed = before != after;
        if changed {
            self.try_emit_skills_changed();
        }
        Ok(changed)
    }

    async fn run_sync(self: Arc<Self>) {
        let changed = match self.skill_service.snapshot_skill_ids() {
            Ok(before) => match self.skill_service.sync_skills_to_db() {
                Ok(()) => match self.skill_service.snapshot_skill_ids() {
                    Ok(after) => before != after,
                    Err(e) => {
                        log::error!("Skill snapshot after sync failed: {e}");
                        false
                    }
                },
                Err(e) => {
                    log::error!("Skill sync failed: {e}");
                    false
                }
            },
            Err(e) => {
                log::error!("Skill snapshot before sync failed: {e}");
                false
            }
        };

        self.sync_in_progress.store(false, Ordering::SeqCst);

        if changed {
            self.try_emit_skills_changed();
        }

        if self.sync_pending.swap(false, Ordering::SeqCst) && !self.paused.load(Ordering::SeqCst) {
            let coordinator = Arc::clone(&self);
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(EMIT_THROTTLE).await;
                coordinator.schedule_sync();
            });
        }
    }

    fn try_emit_skills_changed(self: &Arc<Self>) {
        let mut last_emit = self.last_emit.lock().unwrap();
        let now = Instant::now();
        if now.duration_since(*last_emit) >= EMIT_THROTTLE {
            *last_emit = now;
            self.coalesced_emit.store(false, Ordering::SeqCst);
            if let Err(e) = self.app.emit(TauriEvents::SKILLS_CHANGED, ()) {
                log::error!("Failed to emit skills-changed: {e}");
            }
        } else {
            self.coalesced_emit.store(true, Ordering::SeqCst);
            let wait = EMIT_THROTTLE - now.duration_since(*last_emit);
            drop(last_emit);
            let coordinator = Arc::clone(self);
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(wait).await;
                if coordinator.coalesced_emit.swap(false, Ordering::SeqCst) {
                    if let Ok(mut guard) = coordinator.last_emit.lock() {
                        *guard = Instant::now();
                    }
                    if let Err(e) = coordinator.app.emit(TauriEvents::SKILLS_CHANGED, ()) {
                        log::error!("Failed to emit coalesced skills-changed: {e}");
                    }
                }
            });
        }
    }
}
