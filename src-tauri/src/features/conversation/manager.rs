use crate::error::AppError;
use crate::features::conversation::emitter::ConversationEmitter;
use crate::features::conversation::types::{
    ConversationPhase, ConversationPhaseKind, ConversationSnapshot, ConversationSummary,
    StartTurnResult, TurnStartStatus, TurnWorkItem, MAX_QUEUE_DEPTH,
};
use crate::features::harness::HarnessFactory;
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex as StdMutex};
use tauri::AppHandle;
use tokio::sync::{broadcast, Mutex};

struct ChatRuntime {
    phase: ConversationPhase,
    queue: VecDeque<TurnWorkItem>,
    worker_running: bool,
    cancel_tx: broadcast::Sender<()>,
    active_turn_id: Option<String>,
}

impl ChatRuntime {
    fn new() -> Self {
        let (cancel_tx, _) = broadcast::channel(1);
        Self {
            phase: ConversationPhase::idle(),
            queue: VecDeque::new(),
            worker_running: false,
            cancel_tx,
            active_turn_id: None,
        }
    }
}

pub struct ConversationJobManager {
    runtimes: Mutex<HashMap<String, ChatRuntime>>,
    active_turn_ids: Arc<StdMutex<HashMap<String, String>>>,
    harness_factory: Arc<HarnessFactory>,
}

impl ConversationJobManager {
    pub fn new(harness_factory: Arc<HarnessFactory>) -> Self {
        Self {
            runtimes: Mutex::new(HashMap::new()),
            active_turn_ids: Arc::new(StdMutex::new(HashMap::new())),
            harness_factory,
        }
    }

    pub fn active_turn_id_sync(&self, chat_id: &str) -> Option<String> {
        self.active_turn_ids
            .lock()
            .ok()
            .and_then(|map| map.get(chat_id).cloned())
    }

    async fn set_active_turn_id(&self, chat_id: &str, turn_id: Option<String>) {
        if let Ok(mut map) = self.active_turn_ids.lock() {
            if let Some(id) = turn_id {
                map.insert(chat_id.to_string(), id);
            } else {
                map.remove(chat_id);
            }
        }
    }

    pub async fn enqueue_turn(
        self: &Arc<Self>,
        app: AppHandle,
        work: TurnWorkItem,
    ) -> Result<StartTurnResult, AppError> {
        let chat_id = work.request.chat_id.clone();
        let turn_id = work.turn_id.clone();
        let assistant_message_id = work.assistant_message_id.clone();
        let user_message_id = work.user_message_id.clone();

        let (status, queue_depth, should_spawn) = {
            let mut runtimes = self.runtimes.lock().await;
            let runtime = runtimes
                .entry(chat_id.clone())
                .or_insert_with(ChatRuntime::new);

            if runtime.queue.len() >= MAX_QUEUE_DEPTH {
                return Err(AppError::Validation(format!(
                    "Conversation queue full (max {MAX_QUEUE_DEPTH} pending turns)"
                )));
            }

            let was_busy = runtime.worker_running || !runtime.queue.is_empty();
            runtime.queue.push_back(work);

            let queue_depth = runtime.queue.len();
            let status = if was_busy {
                TurnStartStatus::Queued
            } else {
                TurnStartStatus::Started
            };

            let should_spawn = !runtime.worker_running;
            if should_spawn {
                runtime.worker_running = true;
            }

            (status, queue_depth, should_spawn)
        };

        ConversationEmitter::new(app.clone()).emit_turn_start_status(
            &chat_id,
            &turn_id,
            &user_message_id,
            &assistant_message_id,
            status.clone(),
            queue_depth,
        )?;

        if should_spawn {
            let manager = Arc::clone(self);
            self.set_active_turn_id(&chat_id, Some(turn_id.clone()))
                .await;
            tauri::async_runtime::spawn(async move {
                manager.run_worker(chat_id, app).await;
            });
        } else if matches!(status, TurnStartStatus::Started) {
            self.set_active_turn_id(&chat_id, Some(turn_id.clone()))
                .await;
        }

        Ok(StartTurnResult {
            turn_id,
            assistant_message_id,
            user_message_id,
            status,
            queue_depth,
        })
    }

    pub async fn cancel_turn(&self, chat_id: &str) -> Result<(), AppError> {
        let mut runtimes = self.runtimes.lock().await;
        if let Some(runtime) = runtimes.get_mut(chat_id) {
            let _ = runtime.cancel_tx.send(());
            runtime.queue.clear();
            if let Some(turn_id) = runtime.active_turn_id.clone() {
                runtime.phase = ConversationPhase {
                    kind: ConversationPhaseKind::Cancelled,
                    turn_id: Some(turn_id),
                    ..Default::default()
                };
            } else {
                runtime.phase = ConversationPhase::idle();
            }
        }
        Ok(())
    }

    pub async fn get_snapshot(&self, chat_id: &str) -> ConversationSnapshot {
        let runtimes = self.runtimes.lock().await;
        if let Some(runtime) = runtimes.get(chat_id) {
            ConversationSnapshot {
                chat_id: chat_id.to_string(),
                phase: runtime.phase.clone(),
                queue_depth: runtime.queue.len(),
            }
        } else {
            ConversationSnapshot {
                chat_id: chat_id.to_string(),
                phase: ConversationPhase::idle(),
                queue_depth: 0,
            }
        }
    }

    pub async fn list_active(&self) -> Vec<ConversationSummary> {
        let runtimes = self.runtimes.lock().await;
        runtimes
            .iter()
            .filter(|(_, runtime)| {
                runtime.worker_running
                    || !runtime.queue.is_empty()
                    || runtime.phase.is_busy()
            })
            .map(|(chat_id, runtime)| ConversationSummary {
                chat_id: chat_id.clone(),
                phase: runtime.phase.clone(),
                queue_depth: runtime.queue.len(),
            })
            .collect()
    }

    pub async fn set_phase(&self, chat_id: &str, phase: ConversationPhase) {
        let turn_id = phase.turn_id.clone();
        let mut runtimes = self.runtimes.lock().await;
        if let Some(runtime) = runtimes.get_mut(chat_id) {
            runtime.active_turn_id = turn_id.clone();
            runtime.phase = phase;
        }
        drop(runtimes);
        self.set_active_turn_id(chat_id, turn_id).await;
    }

    pub async fn active_turn_id(&self, chat_id: &str) -> Option<String> {
        let runtimes = self.runtimes.lock().await;
        runtimes
            .get(chat_id)
            .and_then(|runtime| runtime.active_turn_id.clone())
    }

    async fn run_worker(self: Arc<Self>, chat_id: String, app: AppHandle) {
        loop {
            let work = {
                let mut runtimes = self.runtimes.lock().await;
                let Some(runtime) = runtimes.get_mut(&chat_id) else {
                    return;
                };

                if runtime.queue.is_empty() {
                    runtime.worker_running = false;
                    runtime.phase = ConversationPhase::idle();
                    runtime.active_turn_id = None;
                    drop(runtimes);
                    self.set_active_turn_id(&chat_id, None).await;
                    return;
                }

                runtime.queue.pop_front()
            };

            let Some(work) = work else {
                continue;
            };

            let turn_id = work.turn_id.clone();
            let assistant_message_id = work.assistant_message_id.clone();
            let completion = work.completion;

            self.set_phase(
                &chat_id,
                ConversationPhase {
                    kind: ConversationPhaseKind::RunningLlm,
                    turn_id: Some(turn_id.clone()),
                    active_message_id: Some(assistant_message_id.clone()),
                    iteration: Some(0),
                    tool_call_id: None,
                    error: None,
                },
            )
            .await;

            if let Err(e) = ConversationEmitter::new(app.clone()).emit_turn_phase_changed(
                chat_id.clone(),
                turn_id.clone(),
                ConversationPhase {
                    kind: ConversationPhaseKind::RunningLlm,
                    turn_id: Some(turn_id.clone()),
                    active_message_id: Some(assistant_message_id.clone()),
                    iteration: Some(0),
                    tool_call_id: None,
                    error: None,
                },
            ) {
                tracing::error!(error = ?e, "Failed to emit running_llm phase");
            }

            let cancel_rx = {
                let runtimes = self.runtimes.lock().await;
                runtimes
                    .get(&chat_id)
                    .map(|runtime| runtime.cancel_tx.subscribe())
            };

            let cancel_rx = match cancel_rx {
                Some(rx) => rx,
                None => continue,
            };

            let result = self
                .harness_factory
                .process_message_turn(work.request, app.clone(), cancel_rx)
                .await;

            match result {
                Ok(output) => {
                    self.set_phase(
                        &chat_id,
                        ConversationPhase {
                            kind: ConversationPhaseKind::Completed,
                            turn_id: Some(turn_id.clone()),
                            active_message_id: Some(output.assistant_message_id.clone()),
                            iteration: None,
                            tool_call_id: None,
                            error: None,
                        },
                    )
                    .await;

                    let _ = ConversationEmitter::new(app.clone()).emit_turn_phase_changed(
                        chat_id.clone(),
                        turn_id.clone(),
                        ConversationPhase {
                            kind: ConversationPhaseKind::Completed,
                            turn_id: Some(turn_id.clone()),
                            active_message_id: Some(output.assistant_message_id.clone()),
                            iteration: None,
                            tool_call_id: None,
                            error: None,
                        },
                    );

                    if let Some(tx) = completion {
                        let _ = tx.send(Ok((
                            output.assistant_message_id.clone(),
                            output.content.clone(),
                        )));
                    }
                }
                Err(AppError::Cancelled) => {
                    self.set_phase(
                        &chat_id,
                        ConversationPhase {
                            kind: ConversationPhaseKind::Cancelled,
                            turn_id: Some(turn_id.clone()),
                            active_message_id: Some(assistant_message_id.clone()),
                            iteration: None,
                            tool_call_id: None,
                            error: None,
                        },
                    )
                    .await;

                    let _ = ConversationEmitter::new(app.clone()).emit_turn_phase_changed(
                        chat_id.clone(),
                        turn_id,
                        ConversationPhase {
                            kind: ConversationPhaseKind::Cancelled,
                            turn_id: None,
                            active_message_id: Some(assistant_message_id.clone()),
                            iteration: None,
                            tool_call_id: None,
                            error: None,
                        },
                    );

                    if let Some(tx) = completion {
                        let _ = tx.send(Err(AppError::Cancelled));
                    }

                    let mut runtimes = self.runtimes.lock().await;
                    if let Some(runtime) = runtimes.get_mut(&chat_id) {
                        runtime.queue.clear();
                        runtime.worker_running = false;
                        runtime.phase = ConversationPhase::idle();
                    }
                    drop(runtimes);
                    self.set_active_turn_id(&chat_id, None).await;
                    return;
                }
                Err(e) => {
                    let error_msg = e.to_string();
                    self.set_phase(
                        &chat_id,
                        ConversationPhase {
                            kind: ConversationPhaseKind::Failed,
                            turn_id: Some(turn_id.clone()),
                            active_message_id: Some(assistant_message_id.clone()),
                            iteration: None,
                            tool_call_id: None,
                            error: Some(error_msg.clone()),
                        },
                    )
                    .await;

                    let _ = ConversationEmitter::new(app.clone()).emit_turn_phase_changed(
                        chat_id.clone(),
                        turn_id.clone(),
                        ConversationPhase {
                            kind: ConversationPhaseKind::Failed,
                            turn_id: Some(turn_id),
                            active_message_id: Some(assistant_message_id.clone()),
                            iteration: None,
                            tool_call_id: None,
                            error: Some(error_msg.clone()),
                        },
                    );

                    if let Some(tx) = completion {
                        let _ = tx.send(Err(AppError::Generic(error_msg)));
                    }
                }
            }
        }
    }

    pub async fn subscribe_cancellation(
        &self,
        chat_id: &str,
    ) -> broadcast::Receiver<()> {
        let mut runtimes = self.runtimes.lock().await;
        let runtime = runtimes
            .entry(chat_id.to_string())
            .or_insert_with(ChatRuntime::new);
        runtime.cancel_tx.subscribe()
    }
}
