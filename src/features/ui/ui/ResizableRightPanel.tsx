import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/atoms/tooltip';
import {
  DEFAULT_RIGHT_PANEL_WIDTH,
  usePersistRightPanelWidth,
} from '@/features/ui/hooks/useLayoutWidths';
import { toggleRightPanel } from '@/features/ui/state/uiSlice';

const MIN_RIGHT_AREA_WIDTH = 300;
const DRAG_THRESHOLD_PX = 4;

interface ResizableRightPanelProps {
  children: ReactNode;
}

export function ResizableRightPanel({ children }: ResizableRightPanelProps) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('common');
  const isRightPanelOpen = useAppSelector((state) => state.ui.isRightPanelOpen);
  const [rightAreaWidth, setRightAreaWidth] = useState(() => {
    const saved = localStorage.getItem('rightAreaWidth');
    const width = saved ? parseInt(saved, 10) : DEFAULT_RIGHT_PANEL_WIDTH;
    const maxWidth = window.innerWidth / 2;
    return Math.min(width, maxWidth);
  });
  const persistRightPanelWidth = usePersistRightPanelWidth();
  const [resizing, setResizing] = useState(false);
  const dragStartXRef = useRef(0);
  const didDragRef = useRef(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    document.body.style.userSelect = 'none';
  }, []);

  const stopResizing = useCallback(() => {
    setResizing(false);
    document.body.style.userSelect = '';
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      let newWidth = window.innerWidth - e.clientX;
      const maxWidth = window.innerWidth / 2;
      if (newWidth < MIN_RIGHT_AREA_WIDTH) newWidth = MIN_RIGHT_AREA_WIDTH;
      if (newWidth > maxWidth) newWidth = maxWidth;
      setRightAreaWidth(newWidth);
      persistRightPanelWidth(newWidth);
    },
    [persistRightPanelWidth]
  );

  const handleWindowResize = useCallback(() => {
    const maxWidth = window.innerWidth / 2;
    setRightAreaWidth((prev) => {
      const next = Math.min(prev, maxWidth);
      if (next !== prev) {
        persistRightPanelWidth(next);
      }
      return next;
    });
  }, [persistRightPanelWidth]);

  useEffect(() => {
    if (!resizing) return;

    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, resizing, stopResizing]);

  useEffect(() => {
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [handleWindowResize]);

  const handleResizeEnd = useCallback(() => {
    stopResizing();
    if (!didDragRef.current) {
      dispatch(toggleRightPanel());
    }
  }, [dispatch, stopResizing]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragStartXRef.current = e.clientX;
      didDragRef.current = false;
      startResizing(e);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (
          Math.abs(moveEvent.clientX - dragStartXRef.current) >=
          DRAG_THRESHOLD_PX
        ) {
          didDragRef.current = true;
        }
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        handleResizeEnd();
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [handleResizeEnd, startResizing]
  );

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden border-l border-border/50 bg-sidebar transition-[width] duration-300 ease-in-out',
        resizing && 'transition-none duration-0',
        !isRightPanelOpen && 'w-0 border-l-transparent'
      )}
      style={{ width: isRightPanelOpen ? rightAreaWidth : 0 }}
    >
      {isRightPanelOpen && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t('collapseRightPanel')}
              onMouseDown={handleMouseDown}
              className="group/right-resizer absolute top-0 bottom-0 left-0 z-50 flex w-2 -translate-x-1/2 items-center justify-center"
            >
              <span
                aria-hidden
                className={cn(
                  'h-7 w-1 rounded-full bg-muted-foreground/50 transition-opacity duration-150',
                  resizing
                    ? 'opacity-100'
                    : 'opacity-0 group-hover/right-resizer:opacity-100'
                )}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="left"
            sideOffset={6}
            className="border-0 bg-foreground px-2.5 py-2 text-background shadow-md [&>svg]:hidden"
          >
            <div className="flex flex-col gap-0.5 text-xs leading-snug">
              <span>{t('collapseRightPanel')}</span>
              <span className="text-background/65">
                {t('sidebarResizerDrag')}
              </span>
            </div>
          </TooltipContent>
        </Tooltip>
      )}

      <div
        className={cn(
          'h-full bg-sidebar transition-opacity duration-300 ease-in-out',
          !isRightPanelOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}
        style={{ width: rightAreaWidth }}
      >
        {children}
      </div>
    </div>
  );
}
