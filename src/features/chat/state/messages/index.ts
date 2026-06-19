import { createSlice } from '@reduxjs/toolkit';
import { initialState } from './state';
import { reducers } from './reducers';
import { buildExtraReducers } from './extraReducers';
import { fetchMessages } from './thunks/fetchMessages';
import { createSendMessageThunkNew } from './thunks/sendMessageNew';
import { createEditAndResendMessageThunk } from './thunks/editAndResendMessage';

export const sendMessage = createSendMessageThunkNew();
export const editAndResendMessage = createEditAndResendMessageThunk();

const messagesSlice = createSlice({
  name: 'messages',
  initialState,
  reducers,
  extraReducers: (builder) => {
    buildExtraReducers(builder, sendMessage);
  },
});

export { fetchMessages };

export const {
  setMessages,
  addMessage,
  updateMessage,
  updateMessageWithToolCalls,
  appendToMessage,
  appendToThinking,
  updateMessageTokenUsage,
  clearMessages,
  removeMessage,
  removeMessagesAfter,
} = messagesSlice.actions;

export default messagesSlice.reducer;
