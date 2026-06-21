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
import type { StartTurnResult } from './sendMessageNew';

export function createEditAndResendMessageThunk() {
  return createAsyncThunk(
    'messages/editAndResendMessage',
    async (
      {
        chatId,
        messageId,
        newContent,
        files,
        metadata,
      }: {
        chatId: string;
        messageId: string;
        newContent: string;
        files?: string[];
        metadata?: string;
      },
      { getState, dispatch }
    ) => {
      const state = getState() as RootState;

      const cachedMessages =
        messagesApi.endpoints.getMessages.select(chatId)(state).data ?? [];
      const messageIndex = cachedMessages.findIndex((m) => m.id === messageId);

      if (messageIndex !== -1) {
        (dispatch as AppDispatch)(
          messagesApi.util.updateQueryData('getMessages', chatId, (draft) => {
            const index = draft.findIndex((m) => m.id === messageId);
            if (index !== -1) {
              draft.splice(index);
            }
          })
        );
      }

      const context = validateAndExtractState(state, chatId);
      const { isThinkingEnabled, reasoningEffort } = state.chatInput;

      const { updateChatLastMessage } = await import('../../chatsSlice');
      dispatch(updateChatLastMessage({ id: chatId, lastMessage: newContent }));

      setPendingUserTurnSeed(chatId, {
        content: newContent,
        metadata,
      });

      const model = context.llmConnection.models?.find(
        (m) => m.id === context.selectedModel
      );
      const supportsThinking = resolveModelCapabilities(
        model,
        context.selectedModel
      ).thinking;

      const result = await invokeCommand<StartTurnResult>(
        TauriCommands.EDIT_AND_RESEND_MESSAGE,
        {
          chatId,
          messageId,
          newContent,
          newFiles: files,
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
            userMessage.content = newContent;
            if (metadata !== undefined) {
              userMessage.metadata = metadata;
            }
            return;
          }

          draft.push({
            id: result.user_message_id,
            role: 'user',
            content: newContent,
            timestamp: Date.now(),
            ...(metadata !== undefined ? { metadata } : {}),
          });
        })
      );

      takePendingUserTurnSeed(chatId);

      return {
        chatId,
        messageId: result.user_message_id,
        assistantMessageId: result.assistant_message_id,
        turnId: result.turn_id,
      };
    }
  );
}
