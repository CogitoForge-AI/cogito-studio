import { PayloadAction } from '@reduxjs/toolkit';
import type { Message, ToolCall, TokenUsage } from '../../types';
import type { MessagesState } from './state';

/** Legacy reducers kept for backward compatibility with tests and direct dispatches. */
export const reducers = {
  setMessages: (
    _state: MessagesState,
    _action: PayloadAction<{ chatId: string; messages: Message[] }>
  ) => {},
  addMessage: (
    _state: MessagesState,
    _action: PayloadAction<{ chatId: string; message: Message }>
  ) => {},
  updateMessage: (
    _state: MessagesState,
    _action: PayloadAction<{
      chatId: string;
      messageId: string;
      content: string;
    }>
  ) => {},
  updateMessageWithToolCalls: (
    _state: MessagesState,
    _action: PayloadAction<{
      chatId: string;
      messageId: string;
      toolCalls: ToolCall[];
    }>
  ) => {},
  appendToMessage: (
    _state: MessagesState,
    _action: PayloadAction<{ chatId: string; messageId: string; chunk: string }>
  ) => {},
  appendToThinking: (
    _state: MessagesState,
    _action: PayloadAction<{ chatId: string; messageId: string; chunk: string }>
  ) => {},
  updateMessageTokenUsage: (
    _state: MessagesState,
    _action: PayloadAction<{
      chatId: string;
      messageId: string;
      tokenUsage: TokenUsage;
    }>
  ) => {},
  clearMessages: (_state: MessagesState, _action: PayloadAction<string>) => {},
  removeMessage: (
    _state: MessagesState,
    _action: PayloadAction<{ chatId: string; messageId: string }>
  ) => {},
  removeMessagesAfter: (
    _state: MessagesState,
    _action: PayloadAction<{ chatId: string; messageId: string }>
  ) => {},
};
