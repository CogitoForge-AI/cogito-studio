import { describe, it, expect, vi, beforeEach } from 'vitest';
import uiReducer, {
  navigateToChat,
  navigateToSettings,
  toggleSidebar,
  setLanguage,
  setTheme,
  setRightPanelTab,
  loadAppSettings,
  UIState,
} from './uiSlice';
import { invokeCommand } from '@/lib/tauri';

vi.mock('@/lib/tauri', () => ({
  invokeCommand: vi.fn(() => Promise.resolve()),
  TauriCommands: {
    GET_APP_SETTING: 'get_app_setting',
    SAVE_APP_SETTING: 'save_app_setting',
  },
}));

describe('uiSlice', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Reducers', () => {
    it('should handle navigateToSettings', () => {
      const state = uiReducer(initialState, navigateToSettings());
      expect(state.activePage).toBe('settings');
      expect(state.titleBarText).toBe('title');
    });

    it('should handle navigateToChat', () => {
      const state = uiReducer(
        { ...initialState, activePage: 'settings' },
        navigateToChat()
      );
      expect(state.activePage).toBe('chat');
      expect(state.titleBarText).toBeNull();
    });

    it('should handle toggleSidebar', () => {
      const state = uiReducer(initialState, toggleSidebar());
      expect(state.isSidebarCollapsed).toBe(true);
      const state2 = uiReducer(state, toggleSidebar());
      expect(state2.isSidebarCollapsed).toBe(false);
    });

    it('should handle setLanguage and call backend', () => {
      const state = uiReducer(initialState, setLanguage('en'));
      expect(state.language).toBe('en');
      expect(invokeCommand).toHaveBeenCalledWith('save_app_setting', {
        key: 'language',
        value: 'en',
      });
    });

    it('should handle setTheme and call backend', () => {
      const state = uiReducer(initialState, setTheme('dark'));
      expect(state.theme).toBe('dark');
      expect(invokeCommand).toHaveBeenCalledWith('save_app_setting', {
        key: 'theme',
        value: 'dark',
      });
    });

    it('should handle setRightPanelTab for artifacts', () => {
      const state = uiReducer(initialState, setRightPanelTab('artifacts'));
      expect(state.rightPanelTab).toBe('artifacts');
    });
  });

  describe('Extra Reducers', () => {
    it('loadAppSettings.fulfilled should update settings', async () => {
      (invokeCommand as any).mockImplementation((_cmd: string, args: any) => {
        if (args.key === 'language') return Promise.resolve('en');
        if (args.key === 'theme') return Promise.resolve('dark');
        if (args.key === 'enableWorkflowEditor') return Promise.resolve('true');
        if (args.key === 'setupCompleted') return Promise.resolve('true');
        return Promise.resolve(null);
      });

      const dispatch = vi.fn();
      const thunk = loadAppSettings();
      const result = await thunk(dispatch, () => ({}), {});

      const state = uiReducer(initialState, result as any);
      expect(state.language).toBe('en');
      expect(state.theme).toBe('dark');
      expect(state.experiments.enableWorkflowEditor).toBe(true);
      expect(state.setupCompleted).toBe(true);
    });
  });
});
