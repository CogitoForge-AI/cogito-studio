use crate::error::AppError;
use crate::features::harness::tool_execution_context::ToolExecutionContext;
use crate::state::{
    PendingUserQuestion, UserQuestionAnswerInput, UserQuestionDefinition, UserQuestionOption,
    UserQuestionResponse,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::Manager;
use tokio::sync::oneshot;

pub const OTHER_OPTION_ID: &str = "other";

pub fn get_ask_user_tool() -> crate::models::llm_types::ChatCompletionTool {
    crate::models::llm_types::ChatCompletionTool {
        r#type: "function".to_string(),
        function: crate::models::llm_types::ChatCompletionToolFunction {
            name: "ask_user".to_string(),
            description: Some(
                "Ask the user one or more clarifying questions with predefined options. \
                Use when you need the user to choose between approaches or provide missing information. \
                Each question must have a unique id, a prompt, and at least one option (id + label). \
                The UI will append an 'Other' option for free-text input.".to_string(),
            ),
            parameters: Some(json!({
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Optional title shown above the questions"
                    },
                    "questions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": { "type": "string", "description": "Unique question identifier" },
                                "prompt": { "type": "string", "description": "The question text" },
                                "options": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "id": { "type": "string" },
                                            "label": { "type": "string" }
                                        },
                                        "required": ["id", "label"]
                                    },
                                    "minItems": 1
                                },
                                "allow_multiple": {
                                    "type": "boolean",
                                    "description": "Allow multiple selections (default false)"
                                }
                            },
                            "required": ["id", "prompt", "options"]
                        },
                        "minItems": 1
                    }
                },
                "required": ["questions"]
            })),
        },
    }
}

fn parse_questions(arguments: &Value) -> Result<Vec<UserQuestionDefinition>, AppError> {
    let questions_val = arguments
        .get("questions")
        .and_then(|v| v.as_array())
        .ok_or_else(|| AppError::Validation("Missing or invalid 'questions' array".to_string()))?;

    if questions_val.is_empty() {
        return Err(AppError::Validation(
            "At least one question is required".to_string(),
        ));
    }

    let mut questions = Vec::new();
    for q in questions_val {
        let id = q
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::Validation("Question missing 'id'".to_string()))?
            .to_string();
        let prompt = q
            .get("prompt")
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::Validation(format!("Question '{id}' missing 'prompt'")))?
            .to_string();
        let allow_multiple = q
            .get("allow_multiple")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let options_val = q
            .get("options")
            .and_then(|v| v.as_array())
            .ok_or_else(|| {
                AppError::Validation(format!("Question '{id}' missing 'options' array"))
            })?;

        if options_val.is_empty() {
            return Err(AppError::Validation(format!(
                "Question '{id}' must have at least one option"
            )));
        }

        let mut options = Vec::new();
        for opt in options_val {
            let opt_id = opt
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    AppError::Validation(format!("Option in question '{id}' missing 'id'"))
                })?
                .to_string();
            let label = opt
                .get("label")
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    AppError::Validation(format!(
                        "Option '{opt_id}' in question '{id}' missing 'label'"
                    ))
                })?
                .to_string();
            options.push(UserQuestionOption {
                id: opt_id,
                label,
            });
        }

        questions.push(UserQuestionDefinition {
            id,
            prompt,
            options,
            allow_multiple,
        });
    }

    Ok(questions)
}

pub fn resolve_answers_to_llm_format(
    questions: &[UserQuestionDefinition],
    inputs: &[UserQuestionAnswerInput],
) -> Result<Value, AppError> {
    let question_map: HashMap<&str, &UserQuestionDefinition> =
        questions.iter().map(|q| (q.id.as_str(), q)).collect();

    let mut answers = Vec::new();

    for input in inputs {
        let question = question_map.get(input.question_id.as_str()).ok_or_else(|| {
            AppError::Validation(format!(
                "Unknown question_id: {}",
                input.question_id
            ))
        })?;

        let answer_text = if input.option_id == OTHER_OPTION_ID {
            let free_text = input.free_text.as_ref().ok_or_else(|| {
                AppError::Validation(format!(
                    "free_text required when option_id is '{OTHER_OPTION_ID}' for question '{}'",
                    input.question_id
                ))
            })?;
            if free_text.trim().is_empty() {
                return Err(AppError::Validation(format!(
                    "free_text cannot be empty for question '{}'",
                    input.question_id
                )));
            }
            free_text.clone()
        } else {
            let option = question
                .options
                .iter()
                .find(|o| o.id == input.option_id)
                .ok_or_else(|| {
                    AppError::Validation(format!(
                        "Invalid option_id '{}' for question '{}'",
                        input.option_id, input.question_id
                    ))
                })?;
            option.label.clone()
        };

        answers.push(json!({
            "question_id": input.question_id,
            "answer": answer_text,
        }));
    }

    Ok(json!({ "answers": answers }))
}

pub async fn ask_user(
    arguments: Value,
    context: &ToolExecutionContext,
) -> Result<Value, AppError> {
    let questions = parse_questions(&arguments)?;
    let title = arguments
        .get("title")
        .and_then(|v| v.as_str())
        .map(ToString::to_string);

    let (tx, rx) = oneshot::channel::<UserQuestionResponse>();

    {
        let app_state: tauri::State<crate::state::AppState> = context.app.state();
        let mut pending = app_state.pending_user_questions.lock().map_err(|e| {
            AppError::Generic(format!("Failed to lock pending_user_questions: {e}"))
        })?;
        pending.insert(
            context.tool_call_id.clone(),
            PendingUserQuestion {
                questions: questions.clone(),
                sender: tx,
            },
        );
    }

    let event_questions: Vec<UserQuestionDefinition> = questions.clone();

    let emitter = crate::events::ToolEmitter::new(context.app.clone());
    emitter.emit_user_question_request(crate::events::UserQuestionRequestEvent {
        chat_id: context.chat_id.clone(),
        message_id: context.message_id.clone(),
        tool_call_id: context.tool_call_id.clone(),
        title,
        questions: event_questions,
    })?;

    let response = match rx.await {
        Ok(resp) => resp,
        Err(_) => {
            let _ = remove_pending_user_question(&context.app, &context.tool_call_id);
            return Err(AppError::Generic(
                "User question request cancelled".to_string(),
            ));
        }
    };

    let _ = remove_pending_user_question(&context.app, &context.tool_call_id);

    resolve_answers_to_llm_format(&questions, &response.answers)
}

fn remove_pending_user_question(
    app: &tauri::AppHandle,
    tool_call_id: &str,
) -> Result<(), AppError> {
    let app_state: tauri::State<crate::state::AppState> = app.state();
    let mut pending = app_state.pending_user_questions.lock().map_err(|e| {
        AppError::Generic(format!("Failed to lock pending_user_questions: {e}"))
    })?;
    pending.remove(tool_call_id);
    Ok(())
}
