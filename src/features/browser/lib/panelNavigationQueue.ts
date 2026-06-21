import { navigateBrowserTab, reloadBrowserTab } from '../state/browserApi';
import { isLinuxDesktop } from './platform';

type PendingPanelNavigation = {
  tabId: string;
  url: string;
  resolve: () => void;
  reject: (reason: unknown) => void;
};

let pending: PendingPanelNavigation | null = null;

/** Minimum host size before treating the native webview as ready to navigate. */
export const PANEL_WEBVIEW_MIN_HOST_SIZE = 50;

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
  if (isLinuxDesktop()) return;

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
    resolve();
  } catch (error) {
    reject(error);
    throw error;
  }
}

export async function reloadPanelTab(tabId: string): Promise<void> {
  await reloadBrowserTab(tabId);
}
