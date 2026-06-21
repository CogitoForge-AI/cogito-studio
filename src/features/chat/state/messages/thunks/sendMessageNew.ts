import { createAsyncThunk } from '@reduxjs/toolkit';
import { invokeCommand, TauriCommands } from '@/lib/tauri';
import type { AppDispatch, RootState } from '@/app/store';
import { resolveModelCapabilities } from '@/features/llm/lib/model-utils';
import { validateAndExtractState } from '../helpers/sendMessage/stateValidation';
import { messagesApi } from '../../messagesApi';
import {
  setPendingUserTurnSeed,
  takePendingUserTurnSeed,
} from '@/features/chat/lib/pendingUserTurnSeed';

export interface StartTurnResult {
  turn_id: string;
  assistant_message_id: string;
  user_message_id: string;
  status: 'started' | 'queued';
  queue_depth: number;
}

/**
 * Fire-and-forget sendMessage thunk.
 * Backend enqueues the turn and emits events; frontend projection handles UI updates.
 */
export function createSendMessageThunkNew() {
  return createAsyncThunk(
    'messages/sendMessage',
    async (
      {
        chatId,
        content,
        files,
        metadata,
      }: {
        chatId: string;
        content: string;
        files?: string[];
        metadata?: string;
      },
      { getState, dispatch }
    ) => {
      const state = getState() as RootState;
      const context = validateAndExtractState(state, chatId);
      const { isThinkingEnabled, reasoningEffort } = state.chatInput;

      const { updateChatLastMessage } = await import('../../chatsSlice');
      dispatch(updateChatLastMessage({ id: chatId, lastMessage: content }));

      setPendingUserTurnSeed(chatId, { content, metadata });

      const model = context.llmConnection.models?.find(
        (m) => m.id === context.selectedModel
      );
      const supportsThinking = resolveModelCapabilities(
        model,
        context.selectedModel
      ).thinking;

      const result = await invokeCommand<StartTurnResult>(
        TauriCommands.SEND_MESSAGE,
        {
          chatId,
          content,
          files,
          metadata,
          selectedModel: context.selectedModel,
          reasoningEffort:
            isThinkingEnabled && supportsThinking ? reasoningEffort : undefined,
          llmConnectionId: context.llmConnection.id,
        }
      );

      (dispatch as AppDispatch)(
        messagesApi.util.updateQueryData('getMessages', chatId, (draft) => {
          const userMessage = draft.find(
            (m) => m.id === result.user_message_id
          );
          if (userMessage) {
            userMessage.content = content;
            if (metadata !== undefined) {
              userMessage.metadata = metadata;
            }
            return;
          }

          draft.push({
            id: result.user_message_id,
            role: 'user',
            content,
            timestamp: Date.now(),
            ...(metadata !== undefined ? { metadata } : {}),
          });
        })
      );

      takePendingUserTurnSeed(chatId);

      return result;
    }
  );
}
