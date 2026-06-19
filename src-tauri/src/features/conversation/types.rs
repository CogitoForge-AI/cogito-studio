use crate::features::harness::types::MessageTurnRequest;
use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

pub const MAX_QUEUE_DEPTH: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ConversationPhaseKind {
    #[default]
    Idle,
    Queued,
    RunningLlm,
    RunningTools,
    WaitingUser,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ConversationPhase {
    pub kind: ConversationPhaseKind,
    pub turn_id: Option<String>,
    pub active_message_id: Option<String>,
    pub iteration: Option<usize>,
    pub tool_call_id: Option<String>,
    pub error: Option<String>,
}

impl ConversationPhase {
    pub fn idle() -> Self {
        Self {
            kind: ConversationPhaseKind::Idle,
            ..Default::default()
        }
    }

    pub fn is_busy(&self) -> bool {
        matches!(
            self.kind,
            ConversationPhaseKind::Queued
                | ConversationPhaseKind::RunningLlm
                | ConversationPhaseKind::RunningTools
                | ConversationPhaseKind::WaitingUser
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idle_phase_is_not_busy() {
        assert!(!ConversationPhase::idle().is_busy());
    }

    #[test]
    fn running_phases_are_busy() {
        let kinds = [
            ConversationPhaseKind::Queued,
            ConversationPhaseKind::RunningLlm,
            ConversationPhaseKind::RunningTools,
            ConversationPhaseKind::WaitingUser,
        ];
        for kind in kinds {
            let phase = ConversationPhase {
                kind,
                ..Default::default()
            };
            assert!(phase.is_busy());
        }
    }

    #[test]
    fn terminal_phases_are_not_busy() {
        let kinds = [
            ConversationPhaseKind::Completed,
            ConversationPhaseKind::Failed,
            ConversationPhaseKind::Cancelled,
        ];
        for kind in kinds {
            let phase = ConversationPhase {
                kind,
                ..Default::default()
            };
            assert!(!phase.is_busy());
        }
    }

    #[test]
    fn max_queue_depth_is_positive() {
        assert!(MAX_QUEUE_DEPTH > 0);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TurnStartStatus {
    Started,
    Queued,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartTurnResult {
    pub turn_id: String,
    pub assistant_message_id: String,
    pub user_message_id: String,
    pub status: TurnStartStatus,
    pub queue_depth: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationSnapshot {
    pub chat_id: String,
    pub phase: ConversationPhase,
    pub queue_depth: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationSummary {
    pub chat_id: String,
    pub phase: ConversationPhase,
    pub queue_depth: usize,
}

pub struct TurnWorkItem {
    pub turn_id: String,
    pub user_message_id: String,
    pub assistant_message_id: String,
    pub request: MessageTurnRequest,
    pub completion: Option<oneshot::Sender<Result<(String, String), crate::error::AppError>>>,
}
