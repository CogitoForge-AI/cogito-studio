import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Plus, RotateCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/atoms/button/button';
import { Input } from '@/ui/atoms/input';
import { useBrowserNavigation } from '../hooks/useBrowserNavigation';
import { useBrowserTabs } from '../hooks/useBrowserTabs';
import { notifyBrowserError } from '../lib/handleBrowserError';
import { BrowserStreamSkeleton } from './BrowserStreamSkeleton';

const BrowserWebviewHost = lazy(() =>
  import('./BrowserWebviewHost').then((mod) => ({
    default: mod.BrowserWebviewHost,
  }))
);

export interface BrowserViewProps {
  initialUrl?: string;
  /** Show tab bar and navigation toolbar. Set false for fence/embed. */
  showChrome?: boolean;
  className?: string;
  streamClassName?: string;
  /** Fence embed: tab id from useBrowserFence */
  fenceTabId?: string | null;
  fenceAnchorId?: string;
}

const DEFAULT_URL = 'https://example.com';

function tabTitleFromUrl(url: string, fallback: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname || fallback;
  } catch {
    return fallback;
  }
}

export function BrowserView({
  initialUrl = DEFAULT_URL,
  showChrome = true,
  className,
  streamClassName,
  fenceTabId = null,
  fenceAnchorId,
}: BrowserViewProps) {
  const { t } = useTranslation('browser');
  const {
    panelTabs,
    activeTabId,
    loading: tabsLoading,
    createTab,
    destroyTab,
    setActiveTab,
  } = useBrowserTabs();

  const displayTabId = showChrome ? activeTabId : fenceTabId;
  const [addressUrl, setAddressUrl] = useState(initialUrl);

  const activeTab = panelTabs.find((tab) => tab.tab_id === activeTabId);

  const syncChromeFromNav = useCallback(
    (state: { url: string; title: string }) => {
      if (!state.url || !showChrome) return;
      setAddressUrl(state.url);
    },
    [showChrome]
  );

  const { navState, navigating, navigate, goBack, goForward, reload } =
    useBrowserNavigation(displayTabId, syncChromeFromNav);

  const displayUrl = showChrome
    ? addressUrl || activeTab?.url || initialUrl
    : navState.url || initialUrl;

  const handleNavigate = useCallback(
    async (url: string) => {
      const trimmed = url.trim();
      if (!trimmed || !displayTabId) return;
      await navigate(trimmed);
      setAddressUrl(trimmed);
    },
    [displayTabId, navigate]
  );

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleNavigate(addressUrl).catch(() => undefined);
  };

  const handleSelectTab = useCallback(
    async (tabId: string) => {
      const tab = panelTabs.find((item) => item.tab_id === tabId);
      if (!tab) return;
      await setActiveTab(tabId);
      setAddressUrl(tab.url);
    },
    [panelTabs, setActiveTab]
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      if (panelTabs.length <= 1) return;
      destroyTab(tabId).catch(() => undefined);
    },
    [panelTabs.length, destroyTab]
  );

  const handleNewTab = useCallback(() => {
    createTab(DEFAULT_URL)
      .then((tabId) => {
        setAddressUrl(DEFAULT_URL);
        return setActiveTab(tabId);
      })
      .catch((error) => {
        notifyBrowserError(error);
      });
  }, [createTab, setActiveTab]);

  const stream = useMemo(() => {
    if (!displayTabId) {
      return (
        <BrowserStreamSkeleton className={cn('min-h-64', streamClassName)} />
      );
    }
    return (
      <Suspense
        fallback={
          <BrowserStreamSkeleton className={cn('min-h-64', streamClassName)} />
        }
      >
        <BrowserWebviewHost
          tabId={displayTabId}
          contentUrl={displayUrl}
          viewport={showChrome ? 'main_panel' : 'fence'}
          anchorId={fenceAnchorId}
          className={cn('min-h-64 rounded-none border-0', streamClassName)}
        />
      </Suspense>
    );
  }, [displayTabId, displayUrl, showChrome, fenceAnchorId, streamClassName]);

  if (!showChrome) {
    return (
      <div
        className={cn(
          'overflow-hidden rounded-lg border bg-background',
          className
        )}
      >
        {stream}
      </div>
    );
  }

  const busy = tabsLoading || navigating;

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-background shadow-sm',
        className
      )}
    >
      <div className="flex items-center gap-1 overflow-x-auto border-b bg-muted/40 px-2 py-1.5">
        {panelTabs.map((tab) => {
          const active = tab.tab_id === activeTabId;
          return (
            <div
              key={tab.tab_id}
              className={cn(
                'group flex max-w-[180px] shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs',
                active
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-background/70'
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                onClick={() =>
                  handleSelectTab(tab.tab_id).catch(() => undefined)
                }
                title={tab.url}
              >
                {tab.title || tabTitleFromUrl(tab.url, t('newTab'))}
              </button>
              {panelTabs.length > 1 && (
                <button
                  type="button"
                  className="rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                  onClick={() => handleCloseTab(tab.tab_id)}
                  aria-label={t('closeTab')}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          );
        })}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={handleNewTab}
          aria-label={t('newTab')}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      <form
        className="flex items-center gap-1 border-b px-2 py-1.5"
        onSubmit={handleAddressSubmit}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          disabled={!navState.can_go_back || busy}
          onClick={() => goBack().catch(() => undefined)}
          aria-label={t('back')}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          disabled={!navState.can_go_forward || busy}
          onClick={() => goForward().catch(() => undefined)}
          aria-label={t('forward')}
        >
          <ArrowRight className="size-4" />
        </Button>
        <Input
          value={displayUrl}
          onChange={(e) => setAddressUrl(e.target.value)}
          className="h-8 flex-1 font-mono text-xs"
          placeholder={t('addressPlaceholder')}
          disabled={busy}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          disabled={!displayTabId || busy}
          onClick={() => reload().catch(() => undefined)}
          aria-label={t('reload')}
        >
          <RotateCw className={cn('size-4', busy && 'animate-spin')} />
        </Button>
      </form>

      <div className="min-h-0 flex-1 bg-black">{stream}</div>
    </div>
  );
}
