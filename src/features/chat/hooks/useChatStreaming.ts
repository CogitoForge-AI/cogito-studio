import { useEffect, useRef } from 'react';
import { listenToEvent, TauriEvents } from '@/lib/tauri';
import { useAppDispatch } from '@/app/hooks';
import {
  setStreamingMessageId,
  setStreamingByChatId,
  clearStreamingMessageId,
  updateMessageTokenUsage,
} from '@/features/chat/state/messages';
import type { Message } from '@/app/types';
import {
  setChatTitleFromEvent,
  updateChatLastMessage,
} from '@/features/chat/state/chatsSlice';
import { addPermissionRequest } from '@/features/tools/state/toolPermissionSlice';
import { addUserQuestionRequest } from '@/features/chat/state/askUserSlice';
import { useTranslation } from 'react-i18next';
import { messagesApi } from '@/features/chat/state/messagesApi';
import { extractCodeBlocks } from '@/features/chat/lib/code-block-extractor';
import { logger } from '@/lib/logger';

// Event types
interface MessageStartedEvent {
  chat_id: string;
  user_message_id: string;
  assistant_message_id: string;
}

interface MessageChunkEvent {
  chat_id: string;
  message_id: string;
  chunk: string;
}

interface ThinkingChunkEvent {
  chat_id: string;
  message_id: string;
  chunk: string;
}

interface MessageCompleteEvent {
  chat_id: string;
  message_id: string;
  content: string;
  token_usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface MessageErrorEvent {
  chat_id: string;
  message_id: string;
  error: string;
}

interface MessageCancelledEvent {
  chat_id: string;
  message_id: string;
}

interface ToolCallsDetectedEvent {
  chat_id: string;
  message_id: string;
  tool_calls: Array<{
    id: string;
    name: string;
    arguments: unknown;
  }>;
}

interface ToolExecutionStartedEvent {
  chat_id: string;
  message_id: string;
  tool_calls_count: number;
}

interface ToolExecutionProgressEvent {
  chat_id: string;
  message_id: string;
  tool_call_id: string;
  tool_name: string;
  status: 'executing' | 'completed' | 'error';
  result?: unknown;
  error?: string;
}

interface ToolExecutionCompletedEvent {
  chat_id: string;
  message_id: string;
  tool_calls_count: number;
  successful_count: number;
  failed_count: number;
}

interface ToolExecutionErrorEvent {
  chat_id: string;
  message_id: string;
  tool_call_id: string;
  tool_name: string;
  error: string;
}

interface AgentLoopIterationEvent {
  chat_id: string;
  iteration: number;
  max_iterations: number;
  has_tool_calls: boolean;
}

interface ToolPermissionRequestEvent {
  chat_id: string;
  message_id: string;
  tool_calls: Array<{
    id: string;
    name: string;
    arguments: unknown;
  }>;
}

interface UserQuestionRequestEvent {
  chat_id: string;
  message_id: string;
  tool_call_id: string;
  title?: string;
  questions: Array<{
    id: string;
    prompt: string;
    options: Array<{ id: string; label: string }>;
    allow_multiple?: boolean;
  }>;
}

interface MessageMetadataUpdatedEvent {
  chat_id: string;
  message_id: string;
}

interface ChatUpdatedEvent {
  chat_id: string;
  title: string;
}

export function useChatStreaming() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('chat');
  // Track the assistant message currently streaming per chat
  const streamingMessageIdByChatRef = useRef<Record<string, string>>({});
  // Track messages whose completion should keep streaming (agent loop continues)
  const pendingToolLoopByMessageRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const isActiveStreamingMessage = (chatId: string, messageId: string) =>
      streamingMessageIdByChatRef.current[chatId] === messageId;

    const shouldKeepStreaming = (chatId: string, messageId: string) =>
      isActiveStreamingMessage(chatId, messageId) &&
      pendingToolLoopByMessageRef.current[messageId];

    const clearStreamingForChat = (chatId: string, messageId?: string) => {
      if (messageId) {
        delete pendingToolLoopByMessageRef.current[messageId];
      }
      delete streamingMessageIdByChatRef.current[chatId];
      dispatch(
        setStreamingByChatId({
          chatId,
          messageId: null,
        })
      );
      dispatch(clearStreamingMessageId());
    };

    const maybeClearStreaming = (chatId: string, messageId: string) => {
      if (!isActiveStreamingMessage(chatId, messageId)) {
        return;
      }
      if (shouldKeepStreaming(chatId, messageId)) {
        return;
      }
      clearStreamingForChat(chatId, messageId);
    };
    // Listen to message started event
    const unlistenStarted = listenToEvent<MessageStartedEvent>(
      TauriEvents.MESSAGE_STARTED,
      async (payload) => {
        dispatch(
          messagesApi.util.invalidateTags([
            { type: 'Message', id: `LIST_${payload.chat_id}` },
          ])
        );

        streamingMessageIdByChatRef.current[payload.chat_id] =
          payload.assistant_message_id;

        dispatch(
          setStreamingByChatId({
            chatId: payload.chat_id,
            messageId: payload.assistant_message_id,
          })
        );
        dispatch(setStreamingMessageId(payload.assistant_message_id));
      }
    );

    // Listen to message chunk events
    const unlistenChunk = listenToEvent<MessageChunkEvent>(
      TauriEvents.MESSAGE_CHUNK,
      (payload) => {
        dispatch(
          messagesApi.util.updateQueryData(
            'getMessages',
            payload.chat_id,
            (draft: Message[]) => {
              const message = draft.find((m) => m.id === payload.message_id);
              if (message) {
                message.content += payload.chunk;
                const codeBlocks = extractCodeBlocks(message.content);
                message.codeBlocks =
                  codeBlocks.length > 0 ? codeBlocks : undefined;
              }
            }
          )
        );
      }
    );

    // Listen to thinking chunk events
    const unlistenThinkingChunk = listenToEvent<ThinkingChunkEvent>(
      TauriEvents.THINKING_CHUNK,
      (payload) => {
        dispatch(
          messagesApi.util.updateQueryData(
            'getMessages',
            payload.chat_id,
            (draft: Message[]) => {
              const message = draft.find((m) => m.id === payload.message_id);
              if (message) {
                if (!message.reasoning) message.reasoning = '';
                message.reasoning += payload.chunk;
              }
            }
          )
        );
      }
    );

    // Listen to message complete events
    const unlistenComplete = listenToEvent<MessageCompleteEvent>(
      TauriEvents.MESSAGE_COMPLETE,
      async (payload) => {
        dispatch(
          messagesApi.util.updateQueryData(
            'getMessages',
            payload.chat_id,
            (draft: Message[]) => {
              const message = draft.find((m) => m.id === payload.message_id);
              if (message) {
                message.content = payload.content;
                const codeBlocks = extractCodeBlocks(message.content);
                message.codeBlocks =
                  codeBlocks.length > 0 ? codeBlocks : undefined;

                if (payload.token_usage) {
                  message.tokenUsage = {
                    promptTokens: payload.token_usage.prompt_tokens,
                    completionTokens: payload.token_usage.completion_tokens,
                    totalTokens: payload.token_usage.total_tokens,
                  };
                }
              }
            }
          )
        );

        // Also update UI slice for token usage if needed, or rely on RTK Query data.
        // But original code dispatched updateMessageTokenUsage.
        // updateMessageTokenUsage updates 'messages' slice.
        // If we want to keep slice synced (optional, but good for consistency if other parts read slice), we can dispatch it.
        // But 'useMessages' now reads from RTK Query.
        // So updating slice is not strictly needed for the View.
        // However, 'ChatMessages' might pass messages to other utils?

        if (payload.token_usage) {
          const tokenUsage = {
            promptTokens: payload.token_usage.prompt_tokens,
            completionTokens: payload.token_usage.completion_tokens,
            totalTokens: payload.token_usage.total_tokens,
          };
          // We dispatch this action to keep the slice updated just in case, or we can remove it if we fully switched.
          // Since we refactored useMessages to use RTK Query, slice update is redundant for View.
          // But let's keep it to minimize side-effect breakage for now, or better remove it if I trust my refactor.
          // I'll keep it as it was in original file (dispatch updateMessageTokenUsage).
          // Wait, I need to import updateMessageTokenUsage.
          dispatch(
            updateMessageTokenUsage({
              chatId: payload.chat_id,
              messageId: payload.message_id,
              tokenUsage,
            })
          );
        }

        if (payload.token_usage) {
          const { trackStreamingPerformance } =
            await import('@/lib/sentry-utils');
          const startTime = Date.now();
          const duration = Date.now() - startTime;
          trackStreamingPerformance(
            payload.chat_id,
            duration,
            1,
            payload.token_usage.total_tokens
          );
        }

        // Only clear streaming if this is the active message and the agent loop is done
        maybeClearStreaming(payload.chat_id, payload.message_id);

        dispatch(
          updateChatLastMessage({
            id: payload.chat_id,
            lastMessage: payload.content,
          })
        );
      }
    );

    // Listen to message error events
    const unlistenError = listenToEvent<MessageErrorEvent>(
      TauriEvents.MESSAGE_ERROR,
      (payload) => {
        dispatch(
          messagesApi.util.updateQueryData(
            'getMessages',
            payload.chat_id,
            (draft: Message[]) => {
              const message = draft.find((m) => m.id === payload.message_id);
              if (message) {
                message.content = `Error: ${payload.error}`;
              }
            }
          )
        );

        if (isActiveStreamingMessage(payload.chat_id, payload.message_id)) {
          clearStreamingForChat(payload.chat_id, payload.message_id);
        }
      }
    );

    const unlistenCancelled = listenToEvent<MessageCancelledEvent>(
      TauriEvents.MESSAGE_CANCELLED,
      (payload) => {
        if (isActiveStreamingMessage(payload.chat_id, payload.message_id)) {
          clearStreamingForChat(payload.chat_id, payload.message_id);
        }
      }
    );

    // Listen to message metadata updated
    const unlistenMetadataUpdated = listenToEvent<MessageMetadataUpdatedEvent>(
      TauriEvents.MESSAGE_METADATA_UPDATED,
      async (payload) => {
        // Invalidate to refetch message with updated metadata
        dispatch(
          messagesApi.util.invalidateTags([
            { type: 'Message', id: `LIST_${payload.chat_id}` },
          ])
        );

        // Only clear streaming for the active message when the agent loop is done
        maybeClearStreaming(payload.chat_id, payload.message_id);

        // Only show success toast for agent tasks (not for image generation)
        // Agent tasks have specific metadata structure, images are just in metadata
        // We'll skip the toast - if it's truly an agent task, it will be obvious from the UI
        // dispatch(
        //   showSuccess(t('agentTaskCompleted') || 'Agent task completed')
        // );
      }
    );

    // Listen to tool calls detected events
    const unlistenToolCalls = listenToEvent<ToolCallsDetectedEvent>(
      TauriEvents.TOOL_CALLS_DETECTED,
      (payload) => {
        dispatch(
          messagesApi.util.updateQueryData(
            'getMessages',
            payload.chat_id,
            (draft: Message[]) => {
              const message = draft.find((m) => m.id === payload.message_id);
              if (message) {
                message.toolCalls = payload.tool_calls.map((tc) => ({
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.arguments,
                }));
              }
            }
          )
        );

        if (payload.tool_calls && payload.tool_calls.length > 0) {
          pendingToolLoopByMessageRef.current[payload.message_id] = true;
        }
      }
    );

    const unlistenToolExecutionProgress =
      listenToEvent<ToolExecutionProgressEvent>(
        TauriEvents.TOOL_EXECUTION_PROGRESS,
        (payload) => {
          dispatch(
            messagesApi.util.invalidateTags([
              { type: 'Message', id: `LIST_${payload.chat_id}` },
            ])
          );
        }
      );

    const unlistenToolExecutionCompleted =
      listenToEvent<ToolExecutionCompletedEvent>(
        TauriEvents.TOOL_EXECUTION_COMPLETED,
        (payload) => {
          dispatch(
            messagesApi.util.invalidateTags([
              { type: 'Message', id: `LIST_${payload.chat_id}` },
            ])
          );
        }
      );

    const unlistenToolExecutionError = listenToEvent<ToolExecutionErrorEvent>(
      TauriEvents.TOOL_EXECUTION_ERROR,
      (payload) => {
        logger.error(`Tool error: ${payload.error}`);
        dispatch(
          messagesApi.util.invalidateTags([
            { type: 'Message', id: `LIST_${payload.chat_id}` },
          ])
        );

        // Clear streaming when tool execution fails for the active message
        if (isActiveStreamingMessage(payload.chat_id, payload.message_id)) {
          clearStreamingForChat(payload.chat_id, payload.message_id);
        }
      }
    );

    const unlistenToolExecutionStarted =
      listenToEvent<ToolExecutionStartedEvent>(
        TauriEvents.TOOL_EXECUTION_STARTED,
        (_) => {}
      );
    const unlistenAgentLoopIteration = listenToEvent<AgentLoopIterationEvent>(
      TauriEvents.AGENT_LOOP_ITERATION,
      (_) => {}
    );
    const unlistenToolPermissionRequest =
      listenToEvent<ToolPermissionRequestEvent>(
        TauriEvents.TOOL_PERMISSION_REQUEST,
        (payload) => {
          dispatch(
            addPermissionRequest({
              chatId: payload.chat_id,
              messageId: payload.message_id,
              toolCalls: payload.tool_calls,
              timestamp: Date.now(),
            })
          );
        }
      );

    const unlistenUserQuestionRequest = listenToEvent<UserQuestionRequestEvent>(
      TauriEvents.USER_QUESTION_REQUEST,
      (payload) => {
        dispatch(
          addUserQuestionRequest({
            chatId: payload.chat_id,
            messageId: payload.message_id,
            toolCallId: payload.tool_call_id,
            title: payload.title,
            questions: payload.questions.map((q) => ({
              id: q.id,
              prompt: q.prompt,
              options: q.options,
              allowMultiple: q.allow_multiple,
            })),
            timestamp: Date.now(),
          })
        );
      }
    );

    const unlistenChatUpdated = listenToEvent<ChatUpdatedEvent>(
      TauriEvents.CHAT_UPDATED,
      (payload) => {
        logger.info('[useChatStreaming] Received chat_updated event:', payload);
        dispatch(
          setChatTitleFromEvent({
            id: payload.chat_id,
            title: payload.title,
          })
        );
      }
    );

    return () => {
      unlistenStarted.then((fn) => fn());
      unlistenChunk.then((fn) => fn());
      unlistenThinkingChunk.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
      unlistenError.then((fn) => fn());
      unlistenCancelled.then((fn) => fn());
      unlistenToolCalls.then((fn) => fn());
      unlistenToolExecutionStarted.then((fn) => fn());
      unlistenToolExecutionProgress.then((fn) => fn());
      unlistenToolExecutionCompleted.then((fn) => fn());
      unlistenToolExecutionError.then((fn) => fn());
      unlistenAgentLoopIteration.then((fn) => fn());
      unlistenToolPermissionRequest.then((fn) => fn());
      unlistenUserQuestionRequest.then((fn) => fn());
      unlistenMetadataUpdated.then((fn) => fn());
      unlistenChatUpdated.then((fn) => fn());
    };
  }, [dispatch, t]);
}
