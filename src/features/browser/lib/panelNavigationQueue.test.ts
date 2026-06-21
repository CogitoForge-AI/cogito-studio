import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notifyPanelWebviewVisible,
  requestPanelNavigation,
} from './panelNavigationQueue';

const navigateBrowserTab = vi.fn();
const reloadBrowserTab = vi.fn();

vi.mock('../state/browserApi', () => ({
  navigateBrowserTab: (...args: unknown[]) => navigateBrowserTab(...args),
  reloadBrowserTab: (...args: unknown[]) => reloadBrowserTab(...args),
}));

vi.mock('./platform', () => ({
  isLinuxDesktop: () => false,
}));

describe('panelNavigationQueue', () => {
  beforeEach(() => {
    navigateBrowserTab.mockReset();
    reloadBrowserTab.mockReset();
    navigateBrowserTab.mockResolvedValue(undefined);
    reloadBrowserTab.mockResolvedValue(undefined);
  });

  it('navigates once the host reports a visible, sized bounds', async () => {
    const promise = requestPanelNavigation('tab-1', 'file:///tmp/chart.html');

    await notifyPanelWebviewVisible('tab-1', true, 400, 320);
    await promise;

    expect(navigateBrowserTab).toHaveBeenCalledWith(
      'file:///tmp/chart.html',
      'tab-1'
    );
  });

  it('waits until bounds are large enough', async () => {
    const promise = requestPanelNavigation('tab-1', 'file:///tmp/chart.html');

    await notifyPanelWebviewVisible('tab-1', true, 10, 10);
    expect(navigateBrowserTab).not.toHaveBeenCalled();

    await notifyPanelWebviewVisible('tab-1', true, 400, 320);
    await promise;

    expect(navigateBrowserTab).toHaveBeenCalledTimes(1);
  });

  it('ignores visibility updates for a different tab', async () => {
    void requestPanelNavigation('tab-1', 'file:///tmp/chart.html');

    await notifyPanelWebviewVisible('tab-2', true, 400, 320);

    expect(navigateBrowserTab).not.toHaveBeenCalled();
  });
});
