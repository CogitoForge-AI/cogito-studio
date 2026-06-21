import { readTextFile } from '@tauri-apps/plugin-fs';
import { buildSandboxSrcdoc } from '@/features/chat/lib/html-preview';
import { toPanelIframeSrc, withIframeReloadNonce } from './panelIframeSrc';

export type LinuxPanelIframeContent =
  | { kind: 'srcdoc'; value: string }
  | { kind: 'src'; value: string }
  | { kind: 'empty' };

export function filePathFromFileUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'file:') return null;
    return decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
}

export async function resolveLinuxPanelIframeContent(
  url: string,
  reloadNonce = 0
): Promise<LinuxPanelIframeContent> {
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'about:blank') {
    return { kind: 'empty' };
  }

  const filePath = filePathFromFileUrl(trimmed);
  if (filePath) {
    const html = await readTextFile(filePath);
    return { kind: 'srcdoc', value: buildSandboxSrcdoc(html) };
  }

  const iframeSrc = withIframeReloadNonce(
    toPanelIframeSrc(trimmed),
    reloadNonce
  );
  if (iframeSrc === 'about:blank') {
    return { kind: 'empty' };
  }

  return { kind: 'src', value: iframeSrc };
}
