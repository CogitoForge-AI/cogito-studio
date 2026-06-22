import { configureStore } from '@reduxjs/toolkit';
import { mcpConnectionsReducer } from '@/features/mcp';
import workspacesReducer from '@/features/workspace/state/workspacesSlice';
import workspaceSettingsReducer from '@/features/workspace/state/workspaceSettingsSlice';
import chatsReducer from '@/features/chat/state/chatsSlice';
import messagesReducer from '@/features/chat/state/messages';
import chatInputReducer from '@/features/chat/state/chatInputSlice';
import chatSearchReducer from '@/features/chat/state/chatSearchSlice';
import uiReducer from '@/features/ui/state/uiSlice';
import notificationReducer from '@/features/notifications/state/notificationSlice';
import toolPermissionReducer from '@/features/tools/state/toolPermissionSlice';
import askUserReducer from '@/features/chat/state/askUserSlice';
import { notesReducer } from '@/features/notes/state/notesSlice';
import { sentryMiddleware } from './sentryMiddleware';
import { loggingMiddleware } from './loggingMiddleware';
import { baseApi } from './api/baseApi';
import conversationRuntimeReducer from '@/features/chat/state/conversationRuntimeSlice';

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
    mcpConnections: mcpConnectionsReducer,
    workspaces: workspacesReducer,
    chats: chatsReducer,
    messages: messagesReducer,
    workspaceSettings: workspaceSettingsReducer,
    ui: uiReducer,
    chatInput: chatInputReducer,
    notifications: notificationReducer,
    chatSearch: chatSearchReducer,
    toolPermission: toolPermissionReducer,
    askUser: askUserReducer,
    notes: notesReducer,
    conversationRuntime: conversationRuntimeReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      sentryMiddleware,
      loggingMiddleware,
      baseApi.middleware
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
