import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * Map a browser tab URL to a src suitable for an iframe in the main webview.
 * On Linux, child native webviews are packed into the window GtkBox and cannot
 * be positioned; the panel uses iframe rendering instead.
 */
export function toPanelIframeSrc(url: string): string {
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'about:blank') return 'about:blank';

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'file:') {
      return convertFileSrc(decodeURIComponent(parsed.pathname));
    }
    return parsed.href;
  } catch {
    return trimmed;
  }
}

/** Append a cache-busting query param so iframe reloads when navigation repeats. */
export function withIframeReloadNonce(src: string, nonce: number): string {
  if (nonce <= 0 || src === 'about:blank') return src;
  const separator = src.includes('?') ? '&' : '?';
  return `${src}${separator}_nexo=${nonce}`;
}
