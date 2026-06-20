import { navigateBrowserTab, reloadBrowserTab } from '../state/browserApi';

type PendingPanelNavigation = {
  tabId: string;
  url: string;
  resolve: () => void;
  reject: (reason: unknown) => void;
};

let pending: PendingPanelNavigation | null = null;

/** Minimum host size before treating the native webview as ready to navigate. */
export const PANEL_WEBVIEW_MIN_HOST_SIZE = 50;

function isLinuxPlatform(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return !ua.includes('mac') && !ua.includes('win');
}

export function requestPanelNavigation(
  tabId: string,
  url: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    pending = { tabId, url, resolve, reject };
  });
}

export function cancelPanelNavigation(): void {
  if (!pending) return;
  pending.reject(new Error('Panel navigation cancelled'));
  pending = null;
}

export async function notifyPanelWebviewVisible(
  tabId: string,
  visible: boolean,
  width: number,
  height: number
): Promise<void> {
  if (
    !pending ||
    pending.tabId !== tabId ||
    !visible ||
    width < PANEL_WEBVIEW_MIN_HOST_SIZE ||
    height < PANEL_WEBVIEW_MIN_HOST_SIZE
  ) {
    return;
  }

  const { url, resolve, reject } = pending;
  pending = null;

  try {
    await navigateBrowserTab(url, tabId);
    // WebKitGTK on Linux may not paint until a reload after the webview is shown.
    if (isLinuxPlatform()) {
      await reloadBrowserTab(tabId);
    }
    resolve();
  } catch (error) {
    reject(error);
    throw error;
  }
}
