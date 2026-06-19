import { createAsyncThunk } from '@reduxjs/toolkit';
import { invokeCommand, TauriCommands } from '@/lib/tauri';
import type { AppDispatch, RootState } from '@/app/store';
import { validateAndExtractState } from '../helpers/sendMessage/stateValidation';
import { messagesApi } from '../../messagesApi';
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

      const model = context.llmConnection.models?.find(
        (m) => m.id === context.selectedModel
      );
      const supportsThinking = model?.supportsThinking ?? false;

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

      return {
        chatId,
        messageId,
        assistantMessageId: result.assistant_message_id,
        turnId: result.turn_id,
      };
    }
  );
}
