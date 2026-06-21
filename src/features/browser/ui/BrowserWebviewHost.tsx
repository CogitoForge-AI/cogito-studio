import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { listenToEvent, TauriEvents } from '@/lib/tauri';
import { cn } from '@/lib/utils';
import {
  cancelPanelNavigation,
  notifyPanelWebviewVisible,
  PANEL_WEBVIEW_MIN_HOST_SIZE,
} from '../lib/panelNavigationQueue';
import {
  resolveLinuxPanelIframeContent,
  type LinuxPanelIframeContent,
} from '../lib/linuxPanelContent';
import { HTML_PREVIEW_SANDBOX } from '@/features/chat/lib/html-preview';
import { isLinuxDesktop } from '../lib/platform';
import { releaseBrowserViewport, syncBrowserBounds } from '../state/browserApi';
import type { BrowserViewport } from '../types';
import { BrowserStreamSkeleton } from './BrowserStreamSkeleton';

interface BrowserWebviewHostProps {
  tabId: string;
  contentUrl: string;
  viewport?: BrowserViewport;
  anchorId?: string;
  className?: string;
}

const PANEL_OPEN_RESYNC_DELAYS_MS = [50, 350, 500] as const;
const useLinuxIframePanel = isLinuxDesktop();

function isElementVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  if (rect.bottom < 0 || rect.right < 0) return false;
  if (rect.top > window.innerHeight || rect.left > window.innerWidth)
    return false;
  return true;
}

export function resolveWebviewVisible(
  viewport: BrowserViewport,
  geometryVisible: boolean,
  isRightPanelOpen: boolean,
  rightPanelTab: string
): boolean {
  if (!geometryVisible) return false;

  if (viewport === 'main_panel') {
    return isRightPanelOpen && rightPanelTab === 'browser';
  }

  return true;
}

export function BrowserWebviewHost({
  tabId,
  contentUrl,
  viewport = 'main_panel',
  anchorId,
  className,
}: BrowserWebviewHostProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [hostReady, setHostReady] = useState(false);
  const [iframeNonce, setIframeNonce] = useState(0);
  const [iframeContent, setIframeContent] = useState<LinuxPanelIframeContent>({
    kind: 'empty',
  });
  const [iframeLoading, setIframeLoading] = useState(false);
  const isRightPanelOpen = useAppSelector((state) => state.ui.isRightPanelOpen);
  const rightPanelTab = useAppSelector((state) => state.ui.rightPanelTab);

  useEffect(() => {
    setHostReady(false);
    setIframeNonce(0);
    setIframeContent({ kind: 'empty' });
  }, [tabId]);

  useEffect(() => {
    if (!useLinuxIframePanel) return undefined;

    let cancelled = false;
    setIframeLoading(true);

    resolveLinuxPanelIframeContent(contentUrl, iframeNonce)
      .then((content) => {
        if (cancelled) return;
        setIframeContent(content);
      })
      .catch(() => {
        if (cancelled) return;
        setIframeContent({ kind: 'empty' });
      })
      .finally(() => {
        if (!cancelled) setIframeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contentUrl, iframeNonce, tabId]);

  useEffect(() => {
    if (!useLinuxIframePanel) return undefined;

    let unlisten: (() => void) | undefined;
    listenToEvent<{ tab_id: string; url: string }>(
      TauriEvents.BROWSER_NAVIGATED,
      (payload) => {
        if (payload.tab_id !== tabId) return;
        setIframeNonce((value) => value + 1);
        setHostReady(true);
      }
    ).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [tabId]);

  const reportBounds = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const geometryVisible = isElementVisible(el);
    const effectiveVisible = useLinuxIframePanel
      ? false
      : resolveWebviewVisible(
          viewport,
          geometryVisible,
          isRightPanelOpen,
          rightPanelTab
        );

    const bounds = {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      visible: effectiveVisible,
    };

    if (useLinuxIframePanel) {
      if (
        geometryVisible &&
        resolveWebviewVisible(
          viewport,
          geometryVisible,
          isRightPanelOpen,
          rightPanelTab
        ) &&
        rect.width >= PANEL_WEBVIEW_MIN_HOST_SIZE &&
        rect.height >= PANEL_WEBVIEW_MIN_HOST_SIZE
      ) {
        setHostReady(true);
      }
    }

    void syncBrowserBounds(tabId, viewport, bounds, anchorId)
      .then(() =>
        notifyPanelWebviewVisible(
          tabId,
          effectiveVisible,
          rect.width,
          rect.height
        )
      )
      .then(() => {
        if (
          !useLinuxIframePanel &&
          effectiveVisible &&
          rect.width >= PANEL_WEBVIEW_MIN_HOST_SIZE &&
          rect.height >= PANEL_WEBVIEW_MIN_HOST_SIZE
        ) {
          setHostReady(true);
        }
      })
      .catch(() => undefined);
  }, [tabId, viewport, anchorId, isRightPanelOpen, rightPanelTab]);

  const reportBoundsRef = useRef(reportBounds);

  useEffect(() => {
    reportBoundsRef.current = reportBounds;
  }, [reportBounds]);

  const scheduleReport = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      reportBoundsRef.current();
    });
  }, []);

  useEffect(() => {
    scheduleReport();

    const el = containerRef.current;
    if (!el) return undefined;

    const observer = new ResizeObserver(() => {
      scheduleReport();
    });
    observer.observe(el);

    const handleWindowChange = () => scheduleReport();
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      syncBrowserBounds(
        tabId,
        viewport,
        { x: 0, y: 0, width: 0, height: 0, visible: false },
        anchorId
      ).catch(() => undefined);
      releaseBrowserViewport(viewport, anchorId).catch(() => undefined);
    };
  }, [tabId, viewport, anchorId, scheduleReport]);

  useEffect(() => {
    reportBoundsRef.current();
  }, [reportBounds]);

  useEffect(() => {
    if (useLinuxIframePanel) return undefined;

    let unlisten: (() => void) | undefined;
    listenToEvent<{ tab_id: string; url: string }>(
      TauriEvents.BROWSER_NAVIGATED,
      (payload) => {
        if (payload.tab_id === tabId) setHostReady(true);
      }
    ).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [tabId]);

  useEffect(() => {
    if (viewport !== 'main_panel') return;

    const panelActive = isRightPanelOpen && rightPanelTab === 'browser';

    if (!panelActive) {
      cancelPanelNavigation();
      setHostReady(false);
      syncBrowserBounds(
        tabId,
        viewport,
        { x: 0, y: 0, width: 0, height: 0, visible: false },
        anchorId
      ).catch(() => undefined);
      return;
    }

    reportBoundsRef.current();
    const timeouts = PANEL_OPEN_RESYNC_DELAYS_MS.map((delay) =>
      window.setTimeout(() => reportBoundsRef.current(), delay)
    );
    return () => {
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, [tabId, viewport, anchorId, isRightPanelOpen, rightPanelTab]);

  const showIframe =
    useLinuxIframePanel &&
    hostReady &&
    !iframeLoading &&
    iframeContent.kind !== 'empty';

  const showSkeleton = !hostReady || (useLinuxIframePanel && iframeLoading);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative min-h-64 overflow-hidden rounded-lg border bg-muted/20',
        className
      )}
    >
      {showIframe && iframeContent.kind === 'srcdoc' ? (
        <iframe
          key={`${tabId}-${iframeNonce}-srcdoc`}
          title="Browser panel"
          sandbox={HTML_PREVIEW_SANDBOX}
          srcDoc={iframeContent.value}
          className="absolute inset-0 h-full w-full border-0 bg-background"
        />
      ) : null}
      {showIframe && iframeContent.kind === 'src' ? (
        <iframe
          key={`${tabId}-${iframeNonce}-src`}
          title="Browser panel"
          src={iframeContent.value}
          className="absolute inset-0 h-full w-full border-0 bg-background"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      ) : null}
      {showSkeleton ? (
        <BrowserStreamSkeleton className="pointer-events-none absolute inset-0 rounded-none border-0" />
      ) : null}
    </div>
  );
}
