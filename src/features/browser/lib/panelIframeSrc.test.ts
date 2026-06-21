import { describe, expect, it, vi } from 'vitest';
import { toPanelIframeSrc, withIframeReloadNonce } from './panelIframeSrc';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

describe('toPanelIframeSrc', () => {
  it('converts file URLs via convertFileSrc', () => {
    expect(toPanelIframeSrc('file:///home/me/chart.html')).toBe(
      'asset://localhost//home/me/chart.html'
    );
  });

  it('passes through https URLs', () => {
    expect(toPanelIframeSrc('https://example.com')).toBe(
      'https://example.com/'
    );
  });

  it('returns about:blank for empty input', () => {
    expect(toPanelIframeSrc('')).toBe('about:blank');
    expect(toPanelIframeSrc('about:blank')).toBe('about:blank');
  });
});

describe('withIframeReloadNonce', () => {
  it('appends a cache-busting query param', () => {
    expect(withIframeReloadNonce('https://example.com', 2)).toBe(
      'https://example.com?_nexo=2'
    );
  });

  it('leaves about:blank unchanged', () => {
    expect(withIframeReloadNonce('about:blank', 3)).toBe('about:blank');
  });
});
