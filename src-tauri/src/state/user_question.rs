use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserQuestionOption {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserQuestionDefinition {
    pub id: String,
    pub prompt: String,
    pub options: Vec<UserQuestionOption>,
    #[serde(default)]
    pub allow_multiple: bool,
}

/// Wire payload from frontend — option_id is internal; not sent to LLM.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserQuestionAnswerInput {
    pub question_id: String,
    pub option_id: String,
    pub free_text: Option<String>,
}

#[derive(Debug)]
pub struct UserQuestionResponse {
    pub answers: Vec<UserQuestionAnswerInput>,
}

pub struct PendingUserQuestion {
    pub questions: Vec<UserQuestionDefinition>,
    pub sender: oneshot::Sender<UserQuestionResponse>,
}
