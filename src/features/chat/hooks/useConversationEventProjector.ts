import { useEffect } from 'react';
import { listenToEvent, TauriEvents } from '@/lib/tauri';
import { useAppDispatch } from '@/app/hooks';
import { store } from '@/app/store';
import type { Message } from '@/app/types';
import {
  setChatTitleFromEvent,
  updateChatLastMessage,
} from '@/features/chat/state/chatsSlice';
import { addPermissionRequest } from '@/features/tools/state/toolPermissionSlice';
import { addUserQuestionRequest } from '@/features/chat/state/askUserSlice';
import { messagesApi } from '@/features/chat/state/messagesApi';
import { extractCodeBlocks } from '@/features/chat/lib/code-block-extractor';
import {
  nextToolCallTimestamp,
  nextTurnMessageTimestamps,
  toolCallMessageId,
} from '@/features/chat/lib/messageTimestamps';
import { takePendingUserTurnSeed } from '@/features/chat/lib/pendingUserTurnSeed';
import { logger } from '@/lib/logger';
import {
  isActiveConversationPhase,
  setConversationPhase,
  setTurnQueued,
  setTurnStarted,
  type ConversationPhase,
} from '@/features/chat/state/conversationRuntimeSlice';
import { applyArtifactCreated } from '@/features/artifacts/lib/applyArtifactCreated';

interface MessageStartedEvent {
  chat_id: string;
  turn_id?: string;
  user_message_id: string;
  assistant_message_id: string;
}

interface MessageChunkEvent {
  chat_id: string;
  turn_id?: string;
  message_id: string;
  chunk: string;
}

interface MessageCompleteEvent {
  chat_id: string;
  turn_id?: string;
  message_id: string;
  content: string;
  token_usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface LlmCallCompleteEvent extends MessageCompleteEvent {
  turn_id: string;
}

interface ConversationTurnStartedEvent {
  chat_id: string;
  turn_id: string;
  user_message_id: string;
  assistant_message_id: string;
}

interface ConversationTurnQueuedEvent {
  chat_id: string;
  turn_id: string;
  assistant_message_id: string;
  queue_depth: number;
}

interface ConversationTurnPhaseChangedEvent {
  chat_id: string;
  turn_id: string;
  phase: ConversationPhase;
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

function isChatTurnActive(chatId: string): boolean {
  const runtime = store.getState().conversationRuntime.byChatId[chatId];
  if (!runtime) return false;
  return isActiveConversationPhase(runtime.phase.kind);
}

function applyTokenUsage(
  message: Message,
  tokenUsage?: MessageCompleteEvent['token_usage']
) {
  if (!tokenUsage) return;
  message.tokenUsage = {
    promptTokens: tokenUsage.prompt_tokens,
    completionTokens: tokenUsage.completion_tokens,
    totalTokens: tokenUsage.total_tokens,
  };
}

function upsertToolCallMessage(
  dispatch: ReturnType<typeof useAppDispatch>,
  payload: ToolExecutionProgressEvent
) {
  dispatch(
    messagesApi.util.updateQueryData(
      'getMessages',
      payload.chat_id,
      (draft) => {
        const id = toolCallMessageId(payload.tool_call_id);
        const existing = draft.find((m) => m.id === id);
        const assistant = draft.find((m) => m.id === payload.message_id);
        const detectedToolCall = assistant?.toolCalls?.find(
          (toolCall) => toolCall.id === payload.tool_call_id
        );

        let argumentsValue: unknown = detectedToolCall?.arguments ?? {};
        if (existing) {
          try {
            const parsed = JSON.parse(existing.content) as {
              arguments?: unknown;
            };
            if (parsed.arguments !== undefined) {
              argumentsValue = parsed.arguments;
            }
          } catch {
            // Keep detected tool call arguments when existing content is invalid JSON.
          }
        }

        const content = JSON.stringify({
          name: payload.tool_name,
          arguments: argumentsValue,
          status: payload.status,
          ...(payload.result !== undefined ? { result: payload.result } : {}),
          ...(payload.error ? { error: payload.error } : {}),
        });

        if (existing) {
          existing.content = content;
          return;
        }

        draft.push({
          id,
          role: 'tool_call',
          content,
          timestamp: nextToolCallTimestamp(draft, payload.message_id),
          assistantMessageId: payload.message_id,
        });
      }
    )
  );
}

function upsertTurnMessages(
  dispatch: ReturnType<typeof useAppDispatch>,
  chatId: string,
  userMessageId: string,
  assistantMessageId: string
) {
  const pendingSeed = takePendingUserTurnSeed(chatId);

  dispatch(
    messagesApi.util.updateQueryData('getMessages', chatId, (draft) => {
      const needsUser = !draft.some((m) => m.id === userMessageId);
      const needsAssistant = !draft.some((m) => m.id === assistantMessageId);
      const { userTimestamp, assistantTimestamp } = nextTurnMessageTimestamps(
        draft,
        needsUser
      );

      if (needsUser) {
        draft.push({
          id: userMessageId,
          role: 'user',
          content: pendingSeed?.content ?? '',
          timestamp: userTimestamp,
          ...(pendingSeed?.metadata !== undefined
            ? { metadata: pendingSeed.metadata }
            : {}),
        });
      } else if (pendingSeed) {
        const userMessage = draft.find((m) => m.id === userMessageId);
        if (userMessage) {
          userMessage.content = pendingSeed.content;
          if (pendingSeed.metadata !== undefined) {
            userMessage.metadata = pendingSeed.metadata;
          }
        }
      }

      if (needsAssistant) {
        draft.push({
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: assistantTimestamp,
        });
      }
    })
  );
}

function handleLlmCallComplete(
  dispatch: ReturnType<typeof useAppDispatch>,
  payload: MessageCompleteEvent
) {
  dispatch(
    messagesApi.util.updateQueryData(
      'getMessages',
      payload.chat_id,
      (draft: Message[]) => {
        const message = draft.find((m) => m.id === payload.message_id);
        if (message) {
          message.content = payload.content;
          const codeBlocks = extractCodeBlocks(message.content);
          message.codeBlocks = codeBlocks.length > 0 ? codeBlocks : undefined;
          applyTokenUsage(message, payload.token_usage);
        }
      }
    )
  );

  dispatch(
    updateChatLastMessage({
      id: payload.chat_id,
      lastMessage: payload.content,
    })
  );
}

function maybeRefetchMessagesOnTurnEnd(
  dispatch: ReturnType<typeof useAppDispatch>,
  chatId: string,
  phase: ConversationPhase
) {
  if (isActiveConversationPhase(phase.kind)) return;

  dispatch(
    messagesApi.util.invalidateTags([{ type: 'Message', id: `LIST_${chatId}` }])
  );
}

export function useConversationEventProjector() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const pendingContent = new Map<string, string>();
    const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const CONTENT_FLUSH_MS = 400;

    const messageKey = (chatId: string, messageId: string) =>
      `${chatId}:${messageId}`;

    const getStoredContent = (chatId: string, messageId: string): string => {
      const key = messageKey(chatId, messageId);
      const pending = pendingContent.get(key);
      if (pending !== undefined) return pending;

      const cached = messagesApi.endpoints.getMessages.select(chatId)(
        store.getState()
      )?.data;
      return cached?.find((m) => m.id === messageId)?.content ?? '';
    };

    const flushContent = (chatId: string, messageId: string) => {
      const key = messageKey(chatId, messageId);
      const content = pendingContent.get(key);
      if (content === undefined) return;

      dispatch(
        messagesApi.util.updateQueryData(
          'getMessages',
          chatId,
          (draft: Message[]) => {
            const message = draft.find((m) => m.id === messageId);
            if (message) message.content = content;
          }
        )
      );
    };

    const scheduleContentFlush = (chatId: string, messageId: string) => {
      const key = messageKey(chatId, messageId);
      if (flushTimers.has(key)) return;

      flushTimers.set(
        key,
        setTimeout(() => {
          flushTimers.delete(key);
          flushContent(chatId, messageId);
        }, CONTENT_FLUSH_MS)
      );
    };

    const flushContentImmediate = (chatId: string, messageId: string) => {
      const key = messageKey(chatId, messageId);
      const timer = flushTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        flushTimers.delete(key);
      }
      flushContent(chatId, messageId);
    };

    const clearPendingContent = (chatId: string, messageId: string) => {
      pendingContent.delete(messageKey(chatId, messageId));
    };

    const unlistenTurnStarted = listenToEvent<ConversationTurnStartedEvent>(
      TauriEvents.CONVERSATION_TURN_STARTED,
      (payload) => {
        dispatch(
          setTurnStarted({
            chatId: payload.chat_id,
            turnId: payload.turn_id,
            assistantMessageId: payload.assistant_message_id,
          })
        );
        upsertTurnMessages(
          dispatch,
          payload.chat_id,
          payload.user_message_id,
          payload.assistant_message_id
        );
      }
    );

    const unlistenTurnQueued = listenToEvent<ConversationTurnQueuedEvent>(
      TauriEvents.CONVERSATION_TURN_QUEUED,
      (payload) => {
        dispatch(
          setTurnQueued({
            chatId: payload.chat_id,
            turnId: payload.turn_id,
            assistantMessageId: payload.assistant_message_id,
            queueDepth: payload.queue_depth,
          })
        );
      }
    );

    const unlistenPhaseChanged =
      listenToEvent<ConversationTurnPhaseChangedEvent>(
        TauriEvents.CONVERSATION_TURN_PHASE_CHANGED,
        (payload) => {
          dispatch(
            setConversationPhase({
              chatId: payload.chat_id,
              phase: payload.phase,
            })
          );
          maybeRefetchMessagesOnTurnEnd(
            dispatch,
            payload.chat_id,
            payload.phase
          );
        }
      );

    const unlistenStarted = listenToEvent<MessageStartedEvent>(
      TauriEvents.MESSAGE_STARTED,
      (payload) => {
        upsertTurnMessages(
          dispatch,
          payload.chat_id,
          payload.user_message_id,
          payload.assistant_message_id
        );

        if (payload.turn_id) {
          dispatch(
            setConversationPhase({
              chatId: payload.chat_id,
              phase: {
                kind: 'running_llm',
                turn_id: payload.turn_id,
                active_message_id: payload.assistant_message_id,
                iteration: null,
                tool_call_id: null,
                error: null,
              },
            })
          );
        }
      }
    );

    const unlistenChunk = listenToEvent<MessageChunkEvent>(
      TauriEvents.MESSAGE_CHUNK,
      (payload) => {
        const phaseKind =
          store.getState().conversationRuntime.byChatId[payload.chat_id]?.phase
            .kind;
        if (phaseKind === 'cancelled') {
          return;
        }
        const key = messageKey(payload.chat_id, payload.message_id);
        const nextContent =
          getStoredContent(payload.chat_id, payload.message_id) + payload.chunk;
        pendingContent.set(key, nextContent);
        scheduleContentFlush(payload.chat_id, payload.message_id);
      }
    );

    const unlistenLlmComplete = listenToEvent<LlmCallCompleteEvent>(
      TauriEvents.LLM_CALL_COMPLETE,
      (payload) => {
        flushContentImmediate(payload.chat_id, payload.message_id);
        clearPendingContent(payload.chat_id, payload.message_id);
        handleLlmCallComplete(dispatch, payload);
      }
    );

    const unlistenComplete = listenToEvent<MessageCompleteEvent>(
      TauriEvents.MESSAGE_COMPLETE,
      (payload) => {
        flushContentImmediate(payload.chat_id, payload.message_id);
        clearPendingContent(payload.chat_id, payload.message_id);
        handleLlmCallComplete(dispatch, payload);
      }
    );

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
      }
    );

    const unlistenCancelled = listenToEvent<MessageCancelledEvent>(
      TauriEvents.MESSAGE_CANCELLED,
      (payload) => {
        dispatch(
          messagesApi.util.invalidateTags([
            { type: 'Message', id: `LIST_${payload.chat_id}` },
          ])
        );
      }
    );

    const unlistenMetadataUpdated = listenToEvent<MessageMetadataUpdatedEvent>(
      TauriEvents.MESSAGE_METADATA_UPDATED,
      (payload) => {
        if (!isChatTurnActive(payload.chat_id)) {
          dispatch(
            messagesApi.util.invalidateTags([
              { type: 'Message', id: `LIST_${payload.chat_id}` },
            ])
          );
        }
      }
    );

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
      }
    );

    const unlistenToolExecutionProgress =
      listenToEvent<ToolExecutionProgressEvent>(
        TauriEvents.TOOL_EXECUTION_PROGRESS,
        (payload) => {
          upsertToolCallMessage(dispatch, payload);
          if (
            payload.tool_name === 'create_artifact' &&
            payload.status === 'completed'
          ) {
            const selectedChatId = store.getState().chats.selectedChatId;
            if (payload.chat_id === selectedChatId) {
              applyArtifactCreated(dispatch, payload.chat_id);
            }
          }
        }
      );

    const unlistenToolExecutionCompleted =
      listenToEvent<ToolExecutionCompletedEvent>(
        TauriEvents.TOOL_EXECUTION_COMPLETED,
        (payload) => {
          if (!isChatTurnActive(payload.chat_id)) {
            dispatch(
              messagesApi.util.invalidateTags([
                { type: 'Message', id: `LIST_${payload.chat_id}` },
              ])
            );
          }
        }
      );

    const unlistenToolExecutionError = listenToEvent<ToolExecutionErrorEvent>(
      TauriEvents.TOOL_EXECUTION_ERROR,
      (payload) => {
        logger.error(`Tool error: ${payload.error}`);
      }
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
        dispatch(
          setChatTitleFromEvent({
            id: payload.chat_id,
            title: payload.title,
          })
        );
      }
    );

    return () => {
      for (const timer of flushTimers.values()) {
        clearTimeout(timer);
      }
      flushTimers.clear();
      pendingContent.clear();
      unlistenTurnStarted.then((fn) => fn());
      unlistenTurnQueued.then((fn) => fn());
      unlistenPhaseChanged.then((fn) => fn());
      unlistenStarted.then((fn) => fn());
      unlistenChunk.then((fn) => fn());
      unlistenLlmComplete.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
      unlistenError.then((fn) => fn());
      unlistenCancelled.then((fn) => fn());
      unlistenMetadataUpdated.then((fn) => fn());
      unlistenToolCalls.then((fn) => fn());
      unlistenToolExecutionProgress.then((fn) => fn());
      unlistenToolExecutionCompleted.then((fn) => fn());
      unlistenToolExecutionError.then((fn) => fn());
      unlistenToolPermissionRequest.then((fn) => fn());
      unlistenUserQuestionRequest.then((fn) => fn());
      unlistenChatUpdated.then((fn) => fn());
    };
  }, [dispatch]);
}
