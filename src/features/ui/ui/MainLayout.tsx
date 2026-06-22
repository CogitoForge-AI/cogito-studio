import { Suspense, lazy, useEffect, useState } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  ArrowLeft,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/atoms/button/button';
import { KeyboardShortcutsDialog } from '@/features/shortcuts/ui/KeyboardShortcutsDialog';
import { TitleBar } from '@/features/ui/ui/TitleBar';
import { ResizableRightPanel } from '@/features/ui/ui/ResizableRightPanel';
import {
  useRightPanelWidth,
  useSidebarWidth,
} from '@/features/ui/hooks/useLayoutWidths';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  toggleSidebar,
  setAboutOpen,
  navigateToChat,
  toggleRightPanel,
  setWorkspaceSettingsOpen,
} from '@/features/ui/state/uiSlice';

// Screens
import { ChatScreen } from '@/features/chat/ui/ChatScreen';

const About = lazy(() =>
  import('@/features/settings/ui/About').then((module) => ({
    default: module.About,
  }))
);
const ChatSearchDialog = lazy(() =>
  import('@/features/chat/ui/ChatSearchDialog').then((module) => ({
    default: module.ChatSearchDialog,
  }))
);
const ChatRightPanel = lazy(() =>
  import('@/features/chat/ui/ChatRightPanel').then((module) => ({
    default: module.ChatRightPanel,
  }))
);
const SettingsScreen = lazy(() =>
  import('@/features/settings/ui/SettingsScreen').then((module) => ({
    default: module.SettingsScreen,
  }))
);
const WorkspaceSettingsDialog = lazy(() =>
  import('@/features/workspace/ui/WorkspaceSettingsDialog').then((module) => ({
    default: module.WorkspaceSettingsDialog,
  }))
);

function useHasBeenEnabled(enabled: boolean) {
  const [hasBeenEnabled, setHasBeenEnabled] = useState(enabled);

  useEffect(() => {
    if (!enabled || hasBeenEnabled) return;

    const timeoutId = window.setTimeout(() => {
      setHasBeenEnabled(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [enabled, hasBeenEnabled]);

  return enabled || hasBeenEnabled;
}

export function MainLayout() {
  const { t } = useTranslation(['common', 'settings']);
  const dispatch = useAppDispatch();

  const isSidebarCollapsed = useAppSelector(
    (state) => state.ui.isSidebarCollapsed
  );
  const activePage = useAppSelector((state) => state.ui.activePage);
  const titleBarText = useAppSelector((state) => state.ui.titleBarText);
  const isRightPanelOpen = useAppSelector((state) => state.ui.isRightPanelOpen);
  const aboutOpen = useAppSelector((state) => state.ui.aboutOpen);
  const workspaceSettingsOpen = useAppSelector(
    (state) => state.ui.workspaceSettingsOpen
  );
  const chatSearchOpen = useAppSelector((state) => state.chatSearch.searchOpen);
  const sidebarWidth = useSidebarWidth();
  const rightPanelWidth = useRightPanelWidth();
  const isChatSidebarCollapsed = activePage === 'chat' && isSidebarCollapsed;
  const sidebarZoneWidth = isChatSidebarCollapsed ? undefined : sidebarWidth;
  const isWorkspaceSettingsVisible =
    workspaceSettingsOpen || activePage === 'workspaceSettings';
  const hasOpenedAbout = useHasBeenEnabled(aboutOpen);
  const hasOpenedWorkspaceSettings = useHasBeenEnabled(
    isWorkspaceSettingsVisible
  );
  const hasOpenedChatSearch = useHasBeenEnabled(chatSearchOpen);
  const hasOpenedRightPanel = useHasBeenEnabled(isRightPanelOpen);

  return (
    <div className="flex h-screen flex-col bg-background select-none">
      <TitleBar
        sidebarZoneWidth={sidebarZoneWidth}
        isSidebarCollapsed={isChatSidebarCollapsed}
        rightPanelWidth={rightPanelWidth}
        isRightPanelOpen={isRightPanelOpen}
        leftContent={
          activePage === 'chat' ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => dispatch(toggleSidebar())}
              aria-label={
                isSidebarCollapsed
                  ? t('expandSidebar', { ns: 'common' })
                  : t('collapseSidebar', { ns: 'common' })
              }
              className="h-7 w-7"
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </Button>
          ) : titleBarText ? (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => dispatch(navigateToChat())}
                aria-label={t('back', { ns: 'common' })}
                className="h-7 w-7"
              >
                <ArrowLeft className="size-4" />
              </Button>
              <span className="text-sm font-medium text-foreground">
                {t(titleBarText, { ns: 'settings' })}
              </span>
            </div>
          ) : null
        }
        rightContent={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => dispatch(toggleRightPanel())}
            aria-label={
              isRightPanelOpen
                ? t('collapseRightPanel', { ns: 'common' })
                : t('expandRightPanel', { ns: 'common' })
            }
            className="h-7 w-7"
          >
            {isRightPanelOpen ? (
              <PanelRightClose className="size-4" />
            ) : (
              <PanelRightOpen className="size-4" />
            )}
          </Button>
        }
      />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {activePage === 'chat' && <ChatScreen />}
          {activePage === 'settings' && (
            <Suspense fallback={null}>
              <SettingsScreen />
            </Suspense>
          )}
        </div>
        <ResizableRightPanel>
          {hasOpenedRightPanel && (
            <Suspense fallback={null}>
              <ChatRightPanel />
            </Suspense>
          )}
        </ResizableRightPanel>
      </div>

      {/* About Dialog */}
      {hasOpenedAbout && (
        <Suspense fallback={null}>
          <About
            open={aboutOpen}
            onOpenChange={(open) => dispatch(setAboutOpen(open))}
          />
        </Suspense>
      )}

      {hasOpenedWorkspaceSettings && (
        <Suspense fallback={null}>
          <WorkspaceSettingsDialog
            open={isWorkspaceSettingsVisible}
            onOpenChange={(open) => {
              dispatch(setWorkspaceSettingsOpen(open));
              if (!open && activePage === 'workspaceSettings') {
                dispatch(navigateToChat());
              }
            }}
          />
        </Suspense>
      )}

      {/* Chat Search Dialog */}
      {hasOpenedChatSearch && (
        <Suspense fallback={null}>
          <ChatSearchDialog />
        </Suspense>
      )}

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog />
    </div>
  );
}
