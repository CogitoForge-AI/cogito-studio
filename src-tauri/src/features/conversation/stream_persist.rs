use crate::features::message::MessageService;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

const FLUSH_DEBOUNCE_MS: u64 = 75;

struct PendingFlush {
    content_delta: String,
    reasoning_delta: Option<String>,
}

pub struct StreamPersistDebouncer {
    message_service: Arc<MessageService>,
    pending: Mutex<HashMap<String, PendingFlush>>,
}

impl StreamPersistDebouncer {
    pub fn new(message_service: Arc<MessageService>) -> Arc<Self> {
        Arc::new(Self {
            message_service,
            pending: Mutex::new(HashMap::new()),
        })
    }

    pub fn schedule_content_append(self: &Arc<Self>, message_id: String, chunk: String) {
        self.schedule_append(message_id, chunk, None);
    }

    pub fn schedule_reasoning_append(self: &Arc<Self>, message_id: String, chunk: String) {
        self.schedule_append(message_id, chunk, Some(true));
    }

    fn schedule_append(self: &Arc<Self>, message_id: String, chunk: String, is_reasoning: Option<bool>) {
        let should_flush_now = {
            let mut pending = self.pending.lock().unwrap();
            let entry = pending.entry(message_id.clone()).or_insert(PendingFlush {
                content_delta: String::new(),
                reasoning_delta: None,
            });

            if is_reasoning == Some(true) {
                match &mut entry.reasoning_delta {
                    Some(existing) => existing.push_str(&chunk),
                    None => entry.reasoning_delta = Some(chunk),
                }
            } else {
                entry.content_delta.push_str(&chunk);
            }

            entry.content_delta.len() >= 512
        };

        if should_flush_now {
            self.flush_message(&message_id);
            return;
        }

        let debouncer = Arc::clone(self);
        let message_id_for_task = message_id.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(FLUSH_DEBOUNCE_MS)).await;
            debouncer.flush_message(&message_id_for_task);
        });
    }

    pub fn flush_message(&self, message_id: &str) {
        let flush_data = {
            let mut pending = self.pending.lock().unwrap();
            pending.remove(message_id)
        };

        let Some(data) = flush_data else {
            return;
        };

        if !data.content_delta.is_empty() {
            if let Err(e) = self
                .message_service
                .append_content(message_id, &data.content_delta)
            {
                tracing::error!(message_id = %message_id, error = ?e, "Failed to append message content");
            }
        }

        if let Some(reasoning) = data.reasoning_delta {
            if !reasoning.is_empty() {
                if let Err(e) = self
                    .message_service
                    .append_reasoning(message_id, &reasoning)
                {
                    tracing::error!(message_id = %message_id, error = ?e, "Failed to append reasoning");
                }
            }
        }
    }

    pub fn flush_all(&self) {
        let ids: Vec<String> = {
            let pending = self.pending.lock().unwrap();
            pending.keys().cloned().collect()
        };
        for id in ids {
            self.flush_message(&id);
        }
    }
}
