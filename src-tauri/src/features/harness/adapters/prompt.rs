use crate::error::AppError;
use crate::features::harness::adapters::files::{build_user_content_from_parts, extract_flow_description};
use crate::features::harness::traits::{MessageBuilder, PromptProvider};
use crate::features::harness::types::{HarnessMessages, MessageBuildContext, PromptContext};
use crate::features::skill::SkillService;
use crate::models::llm_types::{AssistantContent, ChatMessage, ToolCall, ToolCallFunction};
use std::collections::HashMap;
use std::sync::Arc;

pub struct NexoPromptProvider {
    skill_service: Arc<SkillService>,
}

impl NexoPromptProvider {
    pub fn new(skill_service: Arc<SkillService>) -> Self {
        Self { skill_service }
    }
}

impl PromptProvider for NexoPromptProvider {
    fn build_system_prompt(&self, ctx: &PromptContext<'_>) -> Result<String, AppError> {
        let system_message = ctx
            .system_prompt_override
            .map(String::from)
            .or_else(|| ctx.workspace_settings.system_message.clone());

        let mut final_system_message = crate::features::chat::prompts::get_app_prompt();

        if let Some(msg) = system_message {
            if !msg.trim().is_empty() {
                final_system_message.push_str("\n\n");
                final_system_message.push_str(&msg);
            }
        }

        if let Some(skill_ids_json) = &ctx.workspace_settings.selected_skill_ids {
            let skill_ids: Vec<String> = serde_json::from_str(skill_ids_json).unwrap_or_default();

            if !skill_ids.is_empty() {
                let skills_content =
                    if ctx.provider.map(str::to_lowercase).as_deref() == Some("anthropic") {
                        self.skill_service.generate_skills_xml(&skill_ids)?
                    } else {
                        self.skill_service.generate_skills_markdown(&skill_ids)?
                    };

                if !skills_content.is_empty() {
                    if !final_system_message.is_empty() {
                        final_system_message.push_str("\n\n");
                    }
                    final_system_message.push_str(&skills_content);
                }
            }
        }

        Ok(final_system_message)
    }
}

pub struct NexoMessageBuilder {
    prompt_provider: Arc<dyn PromptProvider>,
    file_loader: Arc<dyn crate::features::harness::traits::FileContentLoader>,
}

impl NexoMessageBuilder {
    pub fn new(
        prompt_provider: Arc<dyn PromptProvider>,
        file_loader: Arc<dyn crate::features::harness::traits::FileContentLoader>,
    ) -> Self {
        Self {
            prompt_provider,
            file_loader,
        }
    }
}

impl MessageBuilder for NexoMessageBuilder {
    fn build_messages(&self, ctx: &MessageBuildContext<'_>) -> Result<HarnessMessages, AppError> {
        let mut api_messages: Vec<ChatMessage> = Vec::new();
        let assistant_tool_calls = collect_assistant_tool_calls(ctx.existing_messages);

        let system_message = self.prompt_provider.build_system_prompt(&ctx.prompt_ctx)?;

        if !system_message.trim().is_empty() {
            api_messages.push(ChatMessage::System {
                content: system_message,
            });
        }

        for msg in ctx.existing_messages {
            if msg.role == "tool_call" {
                continue;
            }

            let chat_msg = match msg.role.as_str() {
                "user" => {
                    let mut effective_content = msg.content.clone();
                    let mut files = None;

                    if let Some(metadata) = &msg.metadata {
                        if let Some(flow_desc) = extract_flow_description(metadata) {
                            effective_content.push_str(&flow_desc);
                        }

                        if let Ok(meta_json) = serde_json::from_str::<serde_json::Value>(metadata)
                        {
                            if let Some(file_array) =
                                meta_json.get("files").and_then(|f| f.as_array())
                            {
                                files = Some(
                                    file_array
                                        .iter()
                                        .filter_map(|f| {
                                            f.as_str().map(std::string::ToString::to_string)
                                        })
                                        .collect::<Vec<String>>(),
                                );
                            } else if let Some(imgs) =
                                meta_json.get("images").and_then(|i| i.as_array())
                            {
                                files = Some(
                                    imgs.iter()
                                        .filter_map(|i| {
                                            i.as_str().map(std::string::ToString::to_string)
                                        })
                                        .collect::<Vec<String>>(),
                                );
                            }
                        }
                    }

                    let content = build_user_content_from_parts(
                        self.file_loader.as_ref(),
                        &effective_content,
                        files.as_deref(),
                    )?;
                    ChatMessage::User { content }
                }
                "assistant" => ChatMessage::Assistant {
                    content: AssistantContent::Text(msg.content.clone()),
                    tool_calls: assistant_tool_calls.get(&msg.id).cloned(),
                },
                "tool" => {
                    if let Some(tool_call_id) = &msg.tool_call_id {
                        ChatMessage::Tool {
                            content: msg.content.clone(),
                            tool_call_id: tool_call_id.clone(),
                        }
                    } else {
                        continue;
                    }
                }
                _ => continue,
            };
            api_messages.push(chat_msg);
        }

        let mut effective_user_content = ctx.user_content.to_string();
        if let Some(metadata) = ctx.user_metadata {
            if let Some(flow_desc) = extract_flow_description(metadata) {
                effective_user_content.push_str(&flow_desc);
            }
        }

        let content = build_user_content_from_parts(
            self.file_loader.as_ref(),
            &effective_user_content,
            ctx.user_files,
        )?;
        api_messages.push(ChatMessage::User { content });

        Ok(api_messages)
    }
}

fn collect_assistant_tool_calls(
    existing_messages: &[crate::features::message::Message],
) -> HashMap<String, Vec<ToolCall>> {
    let mut by_assistant: HashMap<String, Vec<ToolCall>> = HashMap::new();

    for msg in existing_messages {
        if msg.role != "tool_call" {
            continue;
        }

        let Some(assistant_message_id) = msg.assistant_message_id.as_ref() else {
            continue;
        };

        let tool_call_id = msg
            .id
            .strip_prefix("tool_call_")
            .unwrap_or(&msg.id)
            .to_string();

        let payload = serde_json::from_str::<serde_json::Value>(&msg.content).ok();
        let name = payload
            .as_ref()
            .and_then(|v| v.get("name"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string();
        let arguments = payload
            .as_ref()
            .and_then(|v| v.get("arguments"))
            .and_then(|a| {
                if let Some(s) = a.as_str() {
                    Some(s.to_string())
                } else {
                    serde_json::to_string(a).ok()
                }
            })
            .unwrap_or_else(|| "{}".to_string());

        if name.is_empty() {
            continue;
        }

        by_assistant
            .entry(assistant_message_id.clone())
            .or_default()
            .push(ToolCall {
                id: tool_call_id,
                r#type: "function".to_string(),
                function: ToolCallFunction { name, arguments },
            });
    }

    by_assistant
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::harness::adapters::files::DefaultFileContentLoader;
    use crate::features::harness::traits::PromptProvider;
    use crate::features::workspace::settings::WorkspaceSettings;

    struct StubPrompt;

    impl PromptProvider for StubPrompt {
        fn build_system_prompt(&self, _ctx: &PromptContext<'_>) -> Result<String, AppError> {
            Ok("stub-system".to_string())
        }
    }

    #[test]
    fn build_messages_skips_tool_call_role() {
        let builder = NexoMessageBuilder::new(
            Arc::new(StubPrompt),
            Arc::new(DefaultFileContentLoader),
        );

        let settings = WorkspaceSettings {
            workspace_id: "ws1".to_string(),
            llm_connection_id: None,
            system_message: None,
            mcp_tool_ids: None,
            stream_enabled: None,
            default_model: None,
            tool_permission_config: None,
            created_at: 0,
            updated_at: 0,
            max_agent_iterations: None,
            internal_tools_enabled: None,
            selected_skill_ids: None,
        };

        let existing = vec![crate::features::message::Message {
            id: "m1".to_string(),
            chat_id: "c1".to_string(),
            role: "tool_call".to_string(),
            content: "{}".to_string(),
            timestamp: 0,
            assistant_message_id: None,
            tool_call_id: None,
            metadata: None,
            reasoning: None,
        }];

        let ctx = MessageBuildContext {
            prompt_ctx: PromptContext {
                workspace_settings: &settings,
                system_prompt_override: None,
                provider: Some("openai"),
            },
            existing_messages: &existing,
            user_content: "hi",
            user_files: None,
            user_metadata: None,
        };

        let messages = builder.build_messages(&ctx).expect("build");
        assert_eq!(messages.len(), 2);
    }

    #[test]
    fn build_messages_reconstructs_assistant_tool_calls() {
        let builder = NexoMessageBuilder::new(
            Arc::new(StubPrompt),
            Arc::new(DefaultFileContentLoader),
        );

        let settings = WorkspaceSettings {
            workspace_id: "ws1".to_string(),
            llm_connection_id: None,
            system_message: None,
            mcp_tool_ids: None,
            stream_enabled: None,
            default_model: None,
            tool_permission_config: None,
            created_at: 0,
            updated_at: 0,
            max_agent_iterations: None,
            internal_tools_enabled: None,
            selected_skill_ids: None,
        };

        let existing = vec![
            crate::features::message::Message {
                id: "a1".to_string(),
                chat_id: "c1".to_string(),
                role: "assistant".to_string(),
                content: "".to_string(),
                timestamp: 0,
                assistant_message_id: None,
                tool_call_id: None,
                metadata: None,
                reasoning: None,
            },
            crate::features::message::Message {
                id: "tool_call_call_123".to_string(),
                chat_id: "c1".to_string(),
                role: "tool_call".to_string(),
                content: "{\"name\":\"list_processes\",\"arguments\":\"{\\\"limit\\\":5}\"}"
                    .to_string(),
                timestamp: 1,
                assistant_message_id: Some("a1".to_string()),
                tool_call_id: None,
                metadata: None,
                reasoning: None,
            },
            crate::features::message::Message {
                id: "t1".to_string(),
                chat_id: "c1".to_string(),
                role: "tool".to_string(),
                content: "{\"ok\":true}".to_string(),
                timestamp: 1,
                assistant_message_id: None,
                tool_call_id: Some("call_123".to_string()),
                metadata: None,
                reasoning: None,
            },
        ];

        let ctx = MessageBuildContext {
            prompt_ctx: PromptContext {
                workspace_settings: &settings,
                system_prompt_override: None,
                provider: Some("openai"),
            },
            existing_messages: &existing,
            user_content: "ve bieu do",
            user_files: None,
            user_metadata: None,
        };

        let messages = builder.build_messages(&ctx).expect("build");

        match &messages[1] {
            ChatMessage::Assistant { tool_calls, .. } => {
                let calls = tool_calls.clone().unwrap_or_default();
                assert_eq!(calls.len(), 1);
                assert_eq!(calls[0].id, "call_123");
                assert_eq!(calls[0].function.name, "list_processes");
            }
            _ => panic!("expected assistant message with tool calls"),
        }
    }
}
