import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { clearBrowserPendingUrl } from '@/features/ui/state/uiSlice';
import { useBrowserTabs } from '../hooks/useBrowserTabs';
import { notifyBrowserError } from '../lib/handleBrowserError';
import { BrowserView } from './BrowserView';

export function BrowserPanel() {
  const dispatch = useAppDispatch();
  const browserPendingUrl = useAppSelector(
    (state) => state.ui.browserPendingUrl
  );
  const { panelTabs, loading, openUrlInPanel, createTab } = useBrowserTabs();
  const openingPendingRef = useRef(false);
  const initializingRef = useRef(false);

  useEffect(() => {
    if (!browserPendingUrl || openingPendingRef.current) return;
    openingPendingRef.current = true;
    const url = browserPendingUrl;
    dispatch(clearBrowserPendingUrl());
    openUrlInPanel(url)
      .catch((error) => {
        notifyBrowserError(error);
      })
      .finally(() => {
        openingPendingRef.current = false;
      });
  }, [browserPendingUrl, dispatch, openUrlInPanel]);

  useEffect(() => {
    if (
      loading ||
      panelTabs.length > 0 ||
      browserPendingUrl ||
      openingPendingRef.current ||
      initializingRef.current
    ) {
      return;
    }

    initializingRef.current = true;
    createTab()
      .catch((error) => {
        notifyBrowserError(error);
      })
      .finally(() => {
        initializingRef.current = false;
      });
  }, [loading, panelTabs.length, browserPendingUrl, createTab]);

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <BrowserView
        className="h-full min-h-0"
        streamClassName="h-full min-h-[320px]"
      />
    </div>
  );
}
