import type {
  ActionReducerMapBuilder,
  AsyncThunk,
  SerializedError,
} from '@reduxjs/toolkit';
import type { MessagesState } from './state';
import { fetchMessages } from './thunks/fetchMessages';
import type { StartTurnResult } from './thunks/sendMessageNew';

type SendMessageThunk = AsyncThunk<
  StartTurnResult,
  {
    chatId: string;
    content: string;
    files?: string[];
    metadata?: string;
  },
  { state: import('@/app/store').RootState }
>;

export function buildExtraReducers(
  builder: ActionReducerMapBuilder<MessagesState>,
  sendMessage: SendMessageThunk
) {
  builder
    .addCase(fetchMessages.pending, (state) => {
      state.loading = true;
      state.error = null;
    })
    .addCase(fetchMessages.fulfilled, (state) => {
      state.loading = false;
    })
    .addCase(fetchMessages.rejected, (state, action) => {
      state.loading = false;
      state.error = action.error.message || 'Failed to fetch messages';
    })
    .addCase(sendMessage.pending, (state) => {
      state.loading = true;
      state.error = null;
    })
    .addCase(sendMessage.fulfilled, (state) => {
      state.loading = false;
    })
    .addCase(sendMessage.rejected, (state, action) => {
      state.loading = false;
      state.error =
        (action.error as SerializedError).message || 'Failed to send message';
    });
}
