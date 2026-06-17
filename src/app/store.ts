import { configureStore } from '@reduxjs/toolkit';
import { mcpConnectionsReducer } from '@/features/mcp';
import {
  workspacesReducer,
  workspaceSettingsReducer,
} from '@/features/workspace';
import {
  chatsReducer,
  messagesReducer,
  chatInputReducer,
  chatSearchReducer,
} from '@/features/chat';
import uiReducer from '@/features/ui/state/uiSlice';
import notificationReducer from '@/features/notifications/state/notificationSlice';
import toolPermissionReducer from '@/features/tools/state/toolPermissionSlice';
import askUserReducer from '@/features/chat/state/askUserSlice';
import { notesReducer } from '@/features/notes/state/notesSlice';
import { sentryMiddleware } from './sentryMiddleware';
import { loggingMiddleware } from './loggingMiddleware';

import { baseApi } from './api/baseApi';

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
