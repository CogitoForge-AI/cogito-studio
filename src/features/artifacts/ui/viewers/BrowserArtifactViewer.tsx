import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useBrowserNavigation } from '@/features/browser/hooks/useBrowserNavigation';
import { useBrowserTabs } from '@/features/browser/hooks/useBrowserTabs';
import { notifyBrowserError } from '@/features/browser/lib/handleBrowserError';
import { BrowserStreamSkeleton } from '@/features/browser/ui/BrowserStreamSkeleton';
import type { Artifact } from '../../types';
import { ArtifactViewerHeader } from './ArtifactViewerHeader';

const BrowserWebviewHost = lazy(() =>
  import('@/features/browser/ui/BrowserWebviewHost').then((mod) => ({
    default: mod.BrowserWebviewHost,
  }))
);

const WEBVIEW_HOST_CLASS =
  'h-full min-h-0 flex-1 rounded-md border border-border/30 bg-muted/20';

interface BrowserArtifactViewerProps {
  artifact: Artifact;
  url: string;
}

function ArtifactBrowserWebview({
  tabId,
  url,
  hostKey,
}: {
  tabId: string;
  url: string;
  hostKey: string;
}) {
  return (
    <Suspense
      fallback={<BrowserStreamSkeleton className={WEBVIEW_HOST_CLASS} />}
    >
      <BrowserWebviewHost
        key={hostKey}
        tabId={tabId}
        contentUrl={url}
        className={WEBVIEW_HOST_CLASS}
      />
    </Suspense>
  );
}

export function BrowserArtifactViewer({
  artifact,
  url,
}: BrowserArtifactViewerProps) {
  const { activeTabId, openUrlInPanel } = useBrowserTabs();
  const { reload, navigating } = useBrowserNavigation(activeTabId);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const openingRef = useRef(false);

  useEffect(() => {
    if (openingRef.current) return;
    openingRef.current = true;

    openUrlInPanel(url)
      .catch((error) => {
        notifyBrowserError(error);
      })
      .finally(() => {
        openingRef.current = false;
        setLoadedUrl(url);
      });
  }, [url, openUrlInPanel]);

  const handleReload = () => {
    void reload().catch((error) => {
      notifyBrowserError(error);
    });
  };

  const isReady = loadedUrl === url && Boolean(activeTabId) && !navigating;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ArtifactViewerHeader
        artifact={artifact}
        onReload={handleReload}
        reloading={navigating}
        fullscreen={
          isReady
            ? {
                open: isFullscreen,
                onOpenChange: setIsFullscreen,
                content: (
                  <ArtifactBrowserWebview
                    tabId={activeTabId!}
                    url={url}
                    hostKey="artifact-fullscreen"
                  />
                ),
              }
            : null
        }
      />
      <div className="relative min-h-0 flex-1 px-3 py-3">
        {isFullscreen ? null : !isReady ? (
          <BrowserStreamSkeleton className="h-full min-h-[320px]" />
        ) : (
          <ArtifactBrowserWebview
            tabId={activeTabId!}
            url={url}
            hostKey="artifact-panel"
          />
        )}
      </div>
    </div>
  );
}
