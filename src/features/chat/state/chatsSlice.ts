import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { invokeCommand, TauriCommands } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import type { ChatItem } from '../types';

// Types matching Rust structs
interface Chat {
  id: string;
  workspace_id: string;
  title: string;
  last_message: string | null;
  created_at: number;
  updated_at: number;
  agent_id: string | null;
  parent_id: string | null;
}

interface ChatsState {
  chatsByWorkspaceId: Record<string, ChatItem[]>;
  selectedChatId: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: ChatsState = {
  chatsByWorkspaceId: {},
  selectedChatId: null,
  loading: false,
  error: null,
};

// Thunks
export const fetchChats = createAsyncThunk(
  'chats/fetchChats',
  async (workspaceId: string) => {
    const [dbChats, lastChatId] = await Promise.all([
      invokeCommand<Chat[]>(TauriCommands.GET_CHATS, {
        workspaceId,
      }),
      invokeCommand<string | null>(TauriCommands.GET_APP_SETTING, {
        key: 'lastChatId',
      }),
    ]);
    return {
      workspaceId,
      chats: dbChats.map((c) => ({
        id: c.id,
        title: c.title,
        lastMessage: c.last_message || undefined,
        timestamp: c.updated_at * 1000, // Convert to milliseconds
        agentId: c.agent_id || undefined,
        parentId: c.parent_id || undefined,
      })),
      lastChatId,
    };
  }
);

export const createChat = createAsyncThunk(
  'chats/createChat',
  async ({ workspaceId, title }: { workspaceId: string; title: string }) => {
    const id = crypto.randomUUID();
    await invokeCommand<Chat>(TauriCommands.CREATE_CHAT, {
      id,
      workspaceId,
      title,
    });

    // Save as last chat
    invokeCommand(TauriCommands.SAVE_APP_SETTING, {
      key: 'lastChatId',
      value: id,
    }).catch((error) => {
      logger.error('Failed to save lastChatId:', error);
    });

    return {
      id,
      title,
      timestamp: Date.now(), // Use number instead of Date
    };
  }
);

export const updateChatTitle = createAsyncThunk(
  'chats/updateChatTitle',
  async ({ id, title }: { id: string; title: string }) => {
    await invokeCommand(TauriCommands.UPDATE_CHAT, {
      id,
      title,
      lastMessage: null,
    });
    return { id, title };
  }
);

export const updateChatLastMessage = createAsyncThunk(
  'chats/updateChatLastMessage',
  async ({ id, lastMessage }: { id: string; lastMessage: string }) => {
    await invokeCommand(TauriCommands.UPDATE_CHAT, {
      id,
      title: null,
      lastMessage,
    });
    return { id, lastMessage, timestamp: Date.now() }; // Use number instead of Date
  }
);

export const removeChat = createAsyncThunk(
  'chats/removeChat',
  async (id: string) => {
    await invokeCommand(TauriCommands.DELETE_CHAT, { id });
    return id;
  }
);

export const clearAllChats = createAsyncThunk(
  'chats/clearAllChats',
  async (workspaceId: string) => {
    await invokeCommand(TauriCommands.DELETE_ALL_CHATS_BY_WORKSPACE, {
      workspaceId,
    });
    return workspaceId;
  }
);

const chatsSlice = createSlice({
  name: 'chats',
  initialState,
  reducers: {
    setChats: (
      state,
      action: PayloadAction<{ workspaceId: string; chats: ChatItem[] }>
    ) => {
      state.chatsByWorkspaceId[action.payload.workspaceId] =
        action.payload.chats;
    },
    setSelectedChat: (state, action: PayloadAction<string | null>) => {
      state.selectedChatId = action.payload;
      if (action.payload) {
        invokeCommand(TauriCommands.SAVE_APP_SETTING, {
          key: 'lastChatId',
          value: action.payload,
        }).catch((error) => {
          logger.error('Failed to save lastChatId:', error);
        });
      }
    },
    addChat: (
      state,
      action: PayloadAction<{ workspaceId: string; chat: ChatItem }>
    ) => {
      if (!state.chatsByWorkspaceId[action.payload.workspaceId]) {
        state.chatsByWorkspaceId[action.payload.workspaceId] = [];
      }
      state.chatsByWorkspaceId[action.payload.workspaceId].unshift(
        action.payload.chat
      );
    },
    updateChat: (
      state,
      action: PayloadAction<{ workspaceId: string; chat: ChatItem }>
    ) => {
      const chats = state.chatsByWorkspaceId[action.payload.workspaceId];
      if (chats) {
        const index = chats.findIndex((c) => c.id === action.payload.chat.id);
        if (index !== -1) {
          chats[index] = action.payload.chat;
        }
      }
    },
    deleteChat: (
      state,
      action: PayloadAction<{ workspaceId: string; chatId: string }>
    ) => {
      const chats = state.chatsByWorkspaceId[action.payload.workspaceId];
      if (chats) {
        state.chatsByWorkspaceId[action.payload.workspaceId] = chats.filter(
          (c) => c.id !== action.payload.chatId
        );
      }
      if (state.selectedChatId === action.payload.chatId) {
        state.selectedChatId = null;
      }
    },
    closeCurrentChat: (state) => {
      state.selectedChatId = null;
    },
    setChatTitleFromEvent: (
      state,
      action: PayloadAction<{ id: string; title: string }>
    ) => {
      Object.keys(state.chatsByWorkspaceId).forEach((workspaceId) => {
        const chats = state.chatsByWorkspaceId[workspaceId];
        const index = chats.findIndex((c) => c.id === action.payload.id);
        if (index !== -1) {
          chats[index].title = action.payload.title;
        }
      });
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch chats
      .addCase(fetchChats.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchChats.fulfilled, (state, action) => {
        state.loading = false;
        state.chatsByWorkspaceId[action.payload.workspaceId] =
          action.payload.chats;

        // Restore last selected chat if it exists and is in this workspace
        const savedChatInWorkspace =
          action.payload.lastChatId &&
          action.payload.chats.some((c) => c.id === action.payload.lastChatId);

        if (savedChatInWorkspace) {
          state.selectedChatId = action.payload.lastChatId;
        } else {
          // If current selected chat doesn't belong to this workspace,
          // or no chat is selected, pick the most recent one.
          const currentChatInWorkspace =
            state.selectedChatId &&
            action.payload.chats.some((c) => c.id === state.selectedChatId);

          if (!currentChatInWorkspace && action.payload.chats.length > 0) {
            state.selectedChatId = action.payload.chats[0].id;
          }
        }
      })
      .addCase(fetchChats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch chats';
      })
      // Create chat
      .addCase(createChat.fulfilled, (state, action) => {
        const workspaceId = action.meta.arg.workspaceId;
        if (!state.chatsByWorkspaceId[workspaceId]) {
          state.chatsByWorkspaceId[workspaceId] = [];
        }
        state.chatsByWorkspaceId[workspaceId].unshift(action.payload);
        state.selectedChatId = action.payload.id;
      })
      // Update chat title
      .addCase(updateChatTitle.fulfilled, (state, action) => {
        // Find and update in all workspaces
        Object.keys(state.chatsByWorkspaceId).forEach((workspaceId) => {
          const chats = state.chatsByWorkspaceId[workspaceId];
          const index = chats.findIndex((c) => c.id === action.payload.id);
          if (index !== -1) {
            chats[index].title = action.payload.title;
          }
        });
      })
      // Update chat last message
      .addCase(updateChatLastMessage.fulfilled, (state, action) => {
        // Find and update in all workspaces
        Object.keys(state.chatsByWorkspaceId).forEach((workspaceId) => {
          const chats = state.chatsByWorkspaceId[workspaceId];
          const index = chats.findIndex((c) => c.id === action.payload.id);
          if (index !== -1) {
            chats[index].lastMessage = action.payload.lastMessage;
            chats[index].timestamp = action.payload.timestamp;
            // Move to top
            const chat = chats[index];
            chats.splice(index, 1);
            chats.unshift(chat);
          }
        });
      })
      // Remove chat
      .addCase(removeChat.fulfilled, (state, action) => {
        // Find and remove from all workspaces
        Object.keys(state.chatsByWorkspaceId).forEach((workspaceId) => {
          state.chatsByWorkspaceId[workspaceId] = state.chatsByWorkspaceId[
            workspaceId
          ].filter((c) => c.id !== action.payload);
        });
        if (state.selectedChatId === action.payload) {
          state.selectedChatId = null;
        }
      })
      // Clear all chats
      .addCase(clearAllChats.fulfilled, (state, action) => {
        const workspaceId = action.payload;
        state.chatsByWorkspaceId[workspaceId] = [];
        // Clear selected chat if it was in this workspace
        if (
          state.selectedChatId &&
          !state.chatsByWorkspaceId[workspaceId].some(
            (c) => c.id === state.selectedChatId
          )
        ) {
          // This is a bit tricky, but usually clearAllChats is for the current workspace
          state.selectedChatId = null;
        }
      });
  },
});

export const {
  setChats,
  setSelectedChat,
  addChat,
  updateChat,
  deleteChat,
  closeCurrentChat,
  setChatTitleFromEvent,
} = chatsSlice.actions;
export default chatsSlice.reducer;
