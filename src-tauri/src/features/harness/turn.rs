use crate::error::AppError;
use crate::features::harness::intent_router::IntentRouter;
use crate::features::harness::loop_detector::LoopDetector;
use crate::features::harness::providers::agent::AgentToolExecutor;
use crate::features::harness::providers::workspace::WorkspaceToolExecutor;
use crate::features::harness::tool_execution_context::ToolExecutionContext;
use crate::features::harness::traits::HarnessDeps;
use crate::features::harness::types::{TurnInput, TurnOutput};
use crate::models::llm_types::{
    AssistantContent, ChatMessage, LLMChatRequest, LLMChatResponse, UserContent,
};
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::broadcast;

pub struct ConversationTurnController {
    deps: Arc<HarnessDeps>,
    intent_router: IntentRouter,
    loop_detector: LoopDetector,
}

impl ConversationTurnController {
    pub fn new(deps: Arc<HarnessDeps>) -> Self {
        Self {
            deps,
            intent_router: IntentRouter::new(),
            loop_detector: LoopDetector::new(),
        }
    }

    #[allow(clippy::too_many_lines)]
    pub async fn run(
        &self,
        input: TurnInput,
        mut current_messages: Vec<ChatMessage>,
        app: AppHandle,
        cancellation_rx: &mut broadcast::Receiver<()>,
    ) -> Result<TurnOutput, AppError> {
        let TurnInput {
            chat_id,
            workspace_id,
            user_message_id,
            user_content: _,
            user_metadata: _,
            mut assistant_message_id,
            initial_llm_response: _,
            tools,
            system_prompt_override: _,
            model,
            reasoning_effort,
            llm_connection,
            max_iterations,
            stream_enabled,
            agent_id,
            workspace_settings,
        } = input;

        let hooks = self.deps.hooks.clone();
        let session_store = self.deps.session_store.clone();
        let llm_client = self.deps.llm_client.clone();

        let _ = self.intent_router.needs_tools("", tools.is_some());
        self.loop_detector.reset();

        for iteration in 0..=max_iterations {
            let is_last_iteration = iteration == max_iterations;

            hooks
                .on_iteration(
                    &chat_id,
                    iteration + 1,
                    max_iterations + 1,
                    false,
                    &app,
                )
                .await?;

            if iteration > 0 {
                let timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as i64;
                let new_assistant_message_id = uuid::Uuid::new_v4().to_string();

                session_store.create_assistant_message(
                    &chat_id,
                    &new_assistant_message_id,
                    timestamp,
                )?;

                assistant_message_id = new_assistant_message_id;

                hooks
                    .on_message_started(
                        &chat_id,
                        &user_message_id,
                        &assistant_message_id,
                        &app,
                    )
                    .await?;
            }

            let llm_response = {
                let llm_tools = if is_last_iteration {
                    None
                } else {
                    tools.clone()
                };

                let model_for_usage = model.clone();

                let llm_request = LLMChatRequest {
                    model: model.clone(),
                    messages: current_messages.clone(),
                    temperature: Some(0.7),
                    max_tokens: None,
                    stream: stream_enabled,
                    tools: llm_tools,
                    tool_choice: None,
                    reasoning_effort: reasoning_effort.clone(),
                    stream_options: Some(serde_json::json!({
                        "include_usage": true
                    })),
                    response_modalities: None,
                    image_config: None,
                };

                let start_time = std::time::Instant::now();
                let resp = llm_client
                    .chat(
                        &llm_connection.base_url,
                        Some(&llm_connection.api_key),
                        llm_request,
                        &chat_id,
                        &assistant_message_id,
                        app.clone(),
                        Some(cancellation_rx.resubscribe()),
                        &llm_connection.provider,
                    )
                    .await?;
                let latency = start_time.elapsed().as_millis() as u64;

                if iteration == 0 {
                    crate::lib::sentry_helpers::track_llm_call(
                        &llm_connection.provider,
                        &model,
                        "chat_completion",
                        latency,
                        &Ok::<(), Box<dyn std::error::Error>>(()),
                    );
                }

                hooks.record_usage(
                    &workspace_id,
                    &chat_id,
                    &assistant_message_id,
                    &llm_connection.provider,
                    &model_for_usage,
                    resp.usage.as_ref(),
                    latency,
                    stream_enabled,
                );

                session_store.update_assistant_content(
                    &assistant_message_id,
                    &resp.content,
                    resp.reasoning.as_deref(),
                )?;

                Self::finalize_llm_response(
                    &self.deps,
                    &chat_id,
                    &assistant_message_id,
                    &resp,
                    &app,
                )
                .await?;

                resp
            };

            if let Some(tool_calls) = &llm_response.tool_calls {
                if !tool_calls.is_empty() {
                    hooks
                        .on_iteration(
                            &chat_id,
                            iteration + 1,
                            max_iterations + 1,
                            true,
                            &app,
                        )
                        .await?;

                    let allowed_tools = hooks
                        .filter_tool_permissions(
                            &app,
                            &chat_id,
                            &assistant_message_id,
                            tool_calls.clone(),
                            &workspace_settings,
                        )
                        .await?;

                    let tool_results = match self
                        .execute_tool_calls(
                            &chat_id,
                            &assistant_message_id,
                            &workspace_id,
                            agent_id.as_deref(),
                            &allowed_tools,
                            &app,
                            cancellation_rx,
                        )
                        .await
                    {
                        Ok(results) => results,
                        Err(AppError::Cancelled) => return Err(AppError::Cancelled),
                        Err(e) => {
                            tracing::error!(
                                chat_id = %chat_id,
                                error = ?e,
                                "Tool execution failed in agent loop"
                            );
                            hooks
                                .on_tool_execution_error(
                                    &chat_id,
                                    &assistant_message_id,
                                    "agent_loop_error",
                                    "tool_execution",
                                    &format!("Tool execution failed: {e}"),
                                    &app,
                                )
                                .await?;
                            Vec::new()
                        }
                    };

                    let assistant_msg_with_tools = ChatMessage::Assistant {
                        content: AssistantContent::Text(llm_response.content.clone()),
                        tool_calls: Some(tool_calls.clone()),
                    };
                    current_messages.push(assistant_msg_with_tools);
                    current_messages.extend(tool_results);

                    if iteration == max_iterations - 1 {
                        current_messages.push(ChatMessage::User {
                            content: UserContent::Text("Limit reached. You have reached the maximum number of tool calls allowed for this turn. Please provide your final response summarizing what you have found so far without calling any more tools.".to_string()),
                        });
                    }

                    continue;
                }
            }

            let last_message = if llm_response.content.len() > 100 {
                llm_response.content.chars().take(100).collect::<String>() + "..."
            } else {
                llm_response.content.clone()
            };
            session_store.update_chat_last_message(&chat_id, &last_message)?;

            return Ok(TurnOutput {
                assistant_message_id,
                content: llm_response.content,
            });
        }

        Ok(TurnOutput {
            assistant_message_id,
            content: "Iteration limit reached. Please try asking for more specific information."
                .to_string(),
        })
    }

    async fn execute_tool_calls(
        &self,
        chat_id: &str,
        assistant_message_id: &str,
        workspace_id: &str,
        agent_id: Option<&str>,
        tool_calls: &[crate::models::llm_types::ToolCall],
        app: &AppHandle,
        cancellation_rx: &mut broadcast::Receiver<()>,
    ) -> Result<Vec<ChatMessage>, AppError> {
        let hooks = self.deps.hooks.clone();
        let session_store = self.deps.session_store.clone();
        let message_service = self.deps.message_service.clone();

        hooks
            .on_tool_execution_started(
                chat_id,
                assistant_message_id,
                tool_calls.len(),
                app,
            )
            .await?;

        let mut tool_results: Vec<ChatMessage> = Vec::new();
        let mut successful_count = 0;
        let mut failed_count = 0;

        let agent_executor = if let Some(aid) = agent_id {
            let client = self
                .deps
                .agent_manager
                .get_agent_client(app, aid)
                .await
                .map_err(|e| AppError::Generic(e.to_string()))?;
            Some(AgentToolExecutor::new(client))
        } else {
            None
        };

        let workspace_executor = WorkspaceToolExecutor::new(
            self.deps.tool_service.clone(),
            workspace_id,
        )?;

        for tool_call in tool_calls {
            self.loop_detector.record(
                &tool_call.function.name,
                &serde_json::from_str::<serde_json::Value>(&tool_call.function.arguments)
                    .unwrap_or(serde_json::json!({})),
            );
            if self.loop_detector.is_looping() {
                // TODO(harness): return TurnOutcome::NeedsUserInput when LoopDetector is implemented
            }

            let tool_call_message_id = format!("tool_call_{}", tool_call.id);
            let tool_call_timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64;

            let tool_call_data = serde_json::json!({
                "name": tool_call.function.name,
                "arguments": tool_call.function.arguments,
                "status": if tool_call.function.name == "ask_user" { "waiting_for_user" } else { "executing" }
            });

            session_store.create_tool_call_message(
                chat_id,
                &tool_call_message_id,
                assistant_message_id,
                &serde_json::to_string(&tool_call_data)?,
                tool_call_timestamp,
            )?;

            hooks
                .on_tool_execution_progress(
                    chat_id,
                    assistant_message_id,
                    &tool_call.id,
                    &tool_call.function.name,
                    if tool_call.function.name == "ask_user" {
                        "waiting_for_user"
                    } else {
                        "executing"
                    },
                    None,
                    None,
                    app,
                )
                .await?;

            let timeout_secs = if tool_call.function.name == "ask_user" {
                None
            } else {
                Some(60)
            };

            let context = ToolExecutionContext {
                app: app.clone(),
                chat_id: chat_id.to_string(),
                message_id: assistant_message_id.to_string(),
                tool_call_id: tool_call.id.clone(),
            };

            let execution_result = if tool_call.function.name == "ask_user" {
                workspace_executor
                    .execute(
                        &tool_call.function.name,
                        &tool_call.function.arguments,
                        cancellation_rx,
                        timeout_secs,
                        &context,
                    )
                    .await
            } else if let Some(ref executor) = agent_executor {
                executor
                    .execute(
                        &tool_call.function.name,
                        &tool_call.function.arguments,
                        cancellation_rx,
                    )
                    .await
            } else {
                workspace_executor
                    .execute(
                        &tool_call.function.name,
                        &tool_call.function.arguments,
                        cancellation_rx,
                        timeout_secs,
                        &context,
                    )
                    .await
            };

            let result = match execution_result {
                Ok(result) => {
                    successful_count += 1;

                    let completed_data = serde_json::json!({
                        "name": tool_call.function.name,
                        "arguments": tool_call.function.arguments,
                        "result": result,
                        "status": "completed"
                    });
                    session_store.update_tool_call_message(
                        &tool_call_message_id,
                        &serde_json::to_string(&completed_data)?,
                    )?;

                    hooks
                        .on_tool_execution_progress(
                            chat_id,
                            assistant_message_id,
                            &tool_call.id,
                            &tool_call.function.name,
                            "completed",
                            Some(result.clone()),
                            None,
                            app,
                        )
                        .await?;

                    result
                }
                Err(e) => {
                    if matches!(e, AppError::Cancelled) {
                        return Err(AppError::Cancelled);
                    }
                    failed_count += 1;
                    let error_msg = e.to_string();

                    tracing::error!(
                        tool = %tool_call.function.name,
                        chat_id = %chat_id,
                        error = %error_msg,
                        "Tool execution failed"
                    );

                    let error_data = serde_json::json!({
                        "name": tool_call.function.name,
                        "arguments": tool_call.function.arguments,
                        "error": error_msg,
                        "status": "error"
                    });
                    session_store.update_tool_call_message(
                        &tool_call_message_id,
                        &serde_json::to_string(&error_data)?,
                    )?;

                    hooks
                        .on_tool_execution_error(
                            chat_id,
                            assistant_message_id,
                            &tool_call.id,
                            &tool_call.function.name,
                            &error_msg,
                            app,
                        )
                        .await?;

                    hooks
                        .on_tool_execution_progress(
                            chat_id,
                            assistant_message_id,
                            &tool_call.id,
                            &tool_call.function.name,
                            "error",
                            None,
                            Some(error_msg.clone()),
                            app,
                        )
                        .await?;

                    serde_json::json!({ "error": error_msg })
                }
            };

            let tool_result_message_id = format!("tool_result_{}", tool_call.id);

            message_service.create(
                tool_result_message_id,
                chat_id.to_string(),
                "tool".to_string(),
                serde_json::to_string(&result)?,
                Some(tool_call_timestamp),
                None,
                Some(tool_call.id.clone()),
                None,
            )?;

            tool_results.push(ChatMessage::Tool {
                content: serde_json::to_string(&result)?,
                tool_call_id: tool_call.id.clone(),
            });
        }

        hooks
            .on_tool_execution_completed(
                chat_id,
                assistant_message_id,
                tool_calls.len(),
                successful_count,
                failed_count,
                app,
            )
            .await?;

        Ok(tool_results)
    }

    async fn finalize_llm_response(
        deps: &Arc<HarnessDeps>,
        chat_id: &str,
        assistant_message_id: &str,
        llm_response: &LLMChatResponse,
        app: &AppHandle,
    ) -> Result<(), AppError> {
        let mut metadata_obj = serde_json::json!({});

        if let Some(usage) = &llm_response.usage {
            metadata_obj["tokenUsage"] = serde_json::json!(usage);
        }

        if let Some(images) = &llm_response.images {
            if !images.is_empty() {
                let image_urls: Vec<String> = images
                    .iter()
                    .map(|img| format!("data:{};base64,{}", img.mime_type, img.data))
                    .collect();
                metadata_obj["images"] = serde_json::json!(image_urls);
            }
        }

        if !metadata_obj.as_object().is_some_and(|o| o.is_empty()) {
            deps.session_store.update_assistant_metadata(
                assistant_message_id,
                Some(metadata_obj.to_string()),
            )?;

            let app_clone = app.clone();
            let chat_id_clone = chat_id.to_string();
            let assistant_message_id_clone = assistant_message_id.to_string();
            let hooks = deps.hooks.clone();

            tokio::spawn(async move {
                if let Err(e) = hooks
                    .on_metadata_updated(&chat_id_clone, &assistant_message_id_clone, &app_clone)
                    .await
                {
                    tracing::error!(error = ?e, "Failed to emit metadata-updated event");
                }
            });
        }

        if let Some(tool_calls) = &llm_response.tool_calls {
            if !tool_calls.is_empty() {
                deps.hooks
                    .on_tool_calls_detected(chat_id, assistant_message_id, tool_calls, app)
                    .await?;
            }
        }

        Ok(())
    }
}
