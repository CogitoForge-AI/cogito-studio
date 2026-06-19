import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { store } from '@/app/store';
import { useAppSelector, useAppDispatch } from '@/app/hooks';
import { MainLayout } from '@/features/ui/ui/MainLayout';
import { Toaster } from '@/ui/atoms/sonner';
import { DialogOriginProvider } from '@/ui/atoms/dialog/provider';
import { ModalStackProvider } from '@/ui/atoms/modal-stack';
import { useNotificationListener } from '@/hooks/useNotificationListener';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMenuEvents } from '@/hooks/useMenuEvents';
import { useConversationEventProjector } from '@/features/chat/hooks/useConversationEventProjector';
import { useArtifactCreatedListener } from '@/features/artifacts/hooks/useArtifactCreatedListener';
import { loadAppSettings } from '@/features/ui/state/uiSlice';
import i18n from '@/i18n/config';
import { useAutoUpdate } from '@/features/updater/hooks/useAutoUpdate';
import { UpdateModal } from '@/features/updater/ui/UpdateModal';
import { BrowserProvider } from '@/features/browser/state/BrowserProvider';
import { FirstRunSetup } from '@/features/ui/setup/FirstRunSetup';

function AppContent() {
  const dispatch = useAppDispatch();
  const { language, loading, setupCompleted } = useAppSelector(
    (state) => state.ui
  );
  const { theme } = useAppSelector((state) => state.ui);

  // Listen for notification events
  useNotificationListener();

  // Handle keyboard shortcuts
  useKeyboardShortcuts();

  // Listen for chat streaming events from Rust core
  useConversationEventProjector();

  // Refresh artifacts panel when assistant creates a new artifact
  useArtifactCreatedListener();

  // Load all app settings from database on mount
  useEffect(() => {
    dispatch(loadAppSettings());
  }, [dispatch]);

  // Sync Redux state with i18n when language changes
  useEffect(() => {
    if (i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [language]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    const allThemes = [
      'theme-github-light',
      'theme-github-dark',
      'theme-gruvbox',
      'theme-midnight',
      'theme-dracula',
    ];
    root.classList.remove(...allThemes);

    if (theme === 'system') {
      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)'
      ).matches;
      if (prefersDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }

      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        if (e.matches) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    if (theme === 'light') {
      root.classList.remove('dark');
    } else if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.add(`theme-${theme}`);
      const isDark = ['github-dark', 'gruvbox', 'midnight', 'dracula'].includes(
        theme
      );
      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  }, [theme]);

  // Handle auto-updates
  const {
    modalOpen,
    setModalOpen,
    status,
    update,
    installUpdate,
    downloadProgress,
    checkUpdate,
  } = useAutoUpdate();

  // Handle menu events
  useMenuEvents({ onCheckUpdate: () => checkUpdate(false) });

  return (
    <>
      <MainLayout />
      <Toaster />
      <UpdateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        status={status}
        update={update}
        installUpdate={installUpdate}
        downloadProgress={downloadProgress}
      />
      <FirstRunSetup open={!loading && !setupCompleted} />
    </>
  );
}

import { ErrorBoundary } from '@/ui/atoms/ErrorBoundary';

function App() {
  return (
    <Provider store={store}>
      <DialogOriginProvider>
        <ModalStackProvider>
          <ErrorBoundary>
            <BrowserProvider>
              <AppContent />
            </BrowserProvider>
          </ErrorBoundary>
        </ModalStackProvider>
      </DialogOriginProvider>
    </Provider>
  );
}

export default App;
