import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAppSettings } from './useAppSettings';
import { useAppSelector, useAppDispatch } from '@/app/hooks';

vi.mock('@/app/hooks', () => ({
  useAppSelector: vi.fn(),
  useAppDispatch: vi.fn(),
}));

describe('useAppSettings', () => {
  it('should return settings from store', () => {
    (useAppSelector as any).mockImplementation((selector: any) =>
      selector({
        ui: {
          language: 'vi',
          theme: 'dark',
          loading: false,
          experiments: { enableWorkflowEditor: true },
        },
      })
    );

    const dispatch = vi.fn();
    (useAppDispatch as any).mockReturnValue(dispatch);

    const { result } = renderHook(() => useAppSettings());

    expect(result.current.language).toBe('vi');
    expect(result.current.theme).toBe('dark');
    expect(result.current.enableWorkflowEditor).toBe(true);
  });

  it('updateLanguage should dispatch setLanguage', () => {
    const dispatch = vi.fn();
    (useAppDispatch as any).mockReturnValue(dispatch);

    const { result } = renderHook(() => useAppSettings());
    result.current.updateLanguage('en');

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ui/setLanguage',
        payload: 'en',
      })
    );
  });
});
