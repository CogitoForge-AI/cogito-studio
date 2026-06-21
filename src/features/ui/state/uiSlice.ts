import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { invokeCommand, TauriCommands } from '@/lib/tauri';
import { logger } from '@/lib/logger';

export type Page = 'chat' | 'settings' | 'workspaceSettings';

export type SettingsSection =
  | 'general'
  | 'llm'
  | 'mcp'
  | 'usage'
  | 'skills'
  | 'experiments'
  | 'about';

export interface UIState {
  activePage: Page;
  isSidebarCollapsed: boolean;
  titleBarText: string | null;
  aboutOpen: boolean;
  workspaceSettingsOpen: boolean;
  keyboardShortcutsOpen: boolean;
  settingsSection: SettingsSection;
  language: 'vi' | 'en';
  theme:
    | 'light'
    | 'dark'
    | 'system'
    | 'github-light'
    | 'github-dark'
    | 'gruvbox'
    | 'dracula'
    | 'solarized-light'
    | 'solarized-dark'
    | 'one-dark-pro'
    | 'one-light'
    | 'monokai'
    | 'nord'
    | 'ayu-dark';

  loading: boolean;
  agentChatHistoryDrawerOpen: boolean;
  agentChatHistorySessionId: string | null;
  agentChatHistoryAgentId: string | null;
  imagePreviewOpen: boolean;
  imagePreviewUrl: string | null;
  isRightPanelOpen: boolean;
  rightPanelTab: 'notes' | 'skills' | 'info' | 'artifacts' | 'browser';
  browserPendingUrl: string | null;
  experiments: {
    enableWorkflowEditor: boolean;
  };
  setupCompleted: boolean;
}

// Load all app settings from database
export const loadAppSettings = createAsyncThunk(
  'ui/loadAppSettings',
  async () => {
    try {
      // Load all settings in parallel
      const settingsResults = await Promise.all([
        invokeCommand<string | null>(TauriCommands.GET_APP_SETTING, {
          key: 'language',
        }),
        invokeCommand<string | null>(TauriCommands.GET_APP_SETTING, {
          key: 'theme',
        }),
        invokeCommand<string | null>(TauriCommands.GET_APP_SETTING, {
          key: 'enableWorkflowEditor',
        }),
        invokeCommand<string | null>(TauriCommands.GET_APP_SETTING, {
          key: 'setupCompleted',
        }),
      ]);

      const [language, theme, enableWorkflowEditor, setupCompleted] =
        settingsResults;

      // Validate and set language
      let finalLanguage: 'vi' | 'en' = 'vi';
      if (language === 'vi' || language === 'en') {
        finalLanguage = language;
      } else {
        // If not found, save default value to SQLite
        await invokeCommand(TauriCommands.SAVE_APP_SETTING, {
          key: 'language',
          value: 'vi',
        });
      }

      // Validate and set theme
      let finalTheme: UIState['theme'] = 'light';
      const validThemes = [
        'light',
        'dark',
        'system',
        'github-light',
        'github-dark',
        'gruvbox',
        'dracula',
        'solarized-light',
        'solarized-dark',
        'one-dark-pro',
        'one-light',
        'monokai',
        'nord',
        'ayu-dark',
      ];

      if (theme && validThemes.includes(theme)) {
        finalTheme = theme as UIState['theme'];
      } else {
        // If not found, save default value
        await invokeCommand(TauriCommands.SAVE_APP_SETTING, {
          key: 'theme',
          value: 'light',
        });
      }

      return {
        language: finalLanguage,
        theme: finalTheme,
        experiments: {
          enableWorkflowEditor: enableWorkflowEditor === 'true',
        },
        setupCompleted: setupCompleted === 'true',
      };
    } catch (error) {
      logger.error('Failed to load app settings from database:', error);
      return {
        language: 'vi' as const,
        theme: 'light' as const,
        experiments: {
          enableWorkflowEditor: false,
        },
        setupCompleted: false,
      };
    }
  }
);

export const loadLanguage = createAsyncThunk('ui/loadLanguage', async () => {
  try {
    const language = await invokeCommand<string | null>(
      TauriCommands.GET_APP_SETTING,
      {
        key: 'language',
      }
    );
    if (language === 'vi' || language === 'en') {
      return language;
    }
    await invokeCommand(TauriCommands.SAVE_APP_SETTING, {
      key: 'language',
      value: 'vi',
    });
    return 'vi' as const;
  } catch (error) {
    logger.error('Failed to load language from SQLite:', error);
    return 'vi' as const;
  }
});

const initialState: UIState = {
  activePage: 'chat',
  isSidebarCollapsed: false,
  titleBarText: null,
  aboutOpen: false,
  workspaceSettingsOpen: false,
  keyboardShortcutsOpen: false,
  settingsSection: 'general',
  language: 'vi',
  theme: 'light',
  loading: false,
  agentChatHistoryDrawerOpen: false,
  agentChatHistorySessionId: null,
  agentChatHistoryAgentId: null,
  imagePreviewOpen: false,
  imagePreviewUrl: null,
  isRightPanelOpen: false,
  rightPanelTab: 'notes',
  browserPendingUrl: null,
  experiments: {
    enableWorkflowEditor: false,
  },
  setupCompleted: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    navigateToChat: (state) => {
      state.activePage = 'chat';
      state.titleBarText = null;
    },
    navigateToSettings: (state) => {
      state.activePage = 'settings';
      state.titleBarText = 'title'; // Translation key for "Settings"
    },
    navigateToWorkspaceSettings: (state) => {
      state.activePage = 'workspaceSettings';
      state.titleBarText = 'workspaceSettings'; // Translation key
    },
    setTitleBarText: (state, action: PayloadAction<string | null>) => {
      state.titleBarText = action.payload;
    },
    toggleSidebar: (state) => {
      state.isSidebarCollapsed = !state.isSidebarCollapsed;
    },
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.isSidebarCollapsed = action.payload;
    },
    setSettingsSection: (state, action: PayloadAction<SettingsSection>) => {
      state.settingsSection = action.payload;
    },
    setAboutOpen: (state, action: PayloadAction<boolean>) => {
      state.aboutOpen = action.payload;
    },
    setWorkspaceSettingsOpen: (state, action: PayloadAction<boolean>) => {
      state.workspaceSettingsOpen = action.payload;
    },
    setKeyboardShortcutsOpen: (state, action: PayloadAction<boolean>) => {
      state.keyboardShortcutsOpen = action.payload;
    },
    setLanguage: (state, action: PayloadAction<'vi' | 'en'>) => {
      state.language = action.payload;
      invokeCommand(TauriCommands.SAVE_APP_SETTING, {
        key: 'language',
        value: action.payload,
      }).catch((error) => {
        logger.error('Failed to save language to database:', error);
      });
    },
    setTheme: (state, action: PayloadAction<UIState['theme']>) => {
      state.theme = action.payload;
      invokeCommand(TauriCommands.SAVE_APP_SETTING, {
        key: 'theme',
        value: action.payload,
      }).catch((error) => {
        logger.error('Failed to save theme to database:', error);
      });
    },
    setAgentChatHistoryDrawerOpen: (
      state,
      action: PayloadAction<{
        open: boolean;
        sessionId?: string | null;
        agentId?: string | null;
      }>
    ) => {
      state.agentChatHistoryDrawerOpen = action.payload.open;
      if (action.payload.open) {
        state.agentChatHistorySessionId = action.payload.sessionId ?? null;
        state.agentChatHistoryAgentId = action.payload.agentId ?? null;
      } else {
        state.agentChatHistorySessionId = null;
        state.agentChatHistoryAgentId = null;
      }
    },
    setImagePreviewOpen: (
      state,
      action: PayloadAction<{ open: boolean; url?: string | null }>
    ) => {
      state.imagePreviewOpen = action.payload.open;
      if (action.payload.open && action.payload.url) {
        state.imagePreviewUrl = action.payload.url;
      } else if (!action.payload.open) {
        state.imagePreviewUrl = null;
      }
    },
    toggleRightPanel: (state) => {
      state.isRightPanelOpen = !state.isRightPanelOpen;
    },
    setRightPanelOpen: (state, action: PayloadAction<boolean>) => {
      state.isRightPanelOpen = action.payload;
    },
    setRightPanelTab: (
      state,
      action: PayloadAction<UIState['rightPanelTab']>
    ) => {
      state.rightPanelTab = action.payload;
    },
    openBrowserInRightPanel: (
      state,
      action: PayloadAction<{ url: string | null }>
    ) => {
      state.browserPendingUrl = action.payload.url;
      state.rightPanelTab = 'browser';
      state.isRightPanelOpen = true;
    },
    openArtifactsInRightPanel: (state) => {
      state.rightPanelTab = 'artifacts';
      state.isRightPanelOpen = true;
    },
    clearBrowserPendingUrl: (state) => {
      state.browserPendingUrl = null;
    },
    setEnableWorkflowEditor: (state, action: PayloadAction<boolean>) => {
      state.experiments.enableWorkflowEditor = action.payload;
      invokeCommand(TauriCommands.SAVE_APP_SETTING, {
        key: 'enableWorkflowEditor',
        value: action.payload ? 'true' : 'false',
      }).catch((error) => {
        logger.error('Failed to save enableWorkflowEditor to database:', error);
      });
    },
    setSetupCompleted: (state, action: PayloadAction<boolean>) => {
      state.setupCompleted = action.payload;
      invokeCommand(TauriCommands.SAVE_APP_SETTING, {
        key: 'setupCompleted',
        value: action.payload ? 'true' : 'false',
      }).catch((error) => {
        logger.error('Failed to save setupCompleted to database:', error);
      });
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadAppSettings.pending, (state) => {
        state.loading = true;
      })
      .addCase(loadAppSettings.fulfilled, (state, action) => {
        state.language = action.payload.language;
        state.theme = action.payload.theme;
        state.experiments = action.payload.experiments;
        state.setupCompleted = action.payload.setupCompleted;
        state.loading = false;
      })
      .addCase(loadAppSettings.rejected, (state) => {
        state.loading = false;
      })
      .addCase(loadLanguage.pending, (state) => {
        state.loading = true;
      })
      .addCase(loadLanguage.fulfilled, (state, action) => {
        state.language = action.payload;
        state.loading = false;
      })
      .addCase(loadLanguage.rejected, (state) => {
        state.loading = false;
      });
  },
});

export const {
  navigateToChat,
  navigateToSettings,
  navigateToWorkspaceSettings,
  setTitleBarText,
  toggleSidebar,
  setSidebarCollapsed,
  setSettingsSection,
  setAboutOpen,
  setWorkspaceSettingsOpen,
  setKeyboardShortcutsOpen,
  setLanguage,
  setTheme,
  setAgentChatHistoryDrawerOpen,
  setImagePreviewOpen,
  toggleRightPanel,
  setRightPanelOpen,
  setRightPanelTab,
  openBrowserInRightPanel,
  openArtifactsInRightPanel,
  clearBrowserPendingUrl,
  setEnableWorkflowEditor,
  setSetupCompleted,
} = uiSlice.actions;
export default uiSlice.reducer;
