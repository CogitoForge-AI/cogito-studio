import { useState, useEffect, ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { SidebarColumnRow } from '@/features/ui/ui/SidebarColumnRow';

interface TitleBarProps {
  leftContent?: ReactNode;
  rightContent?: ReactNode;
  onClose?: () => void;
  sidebarZoneWidth?: number;
  isSidebarCollapsed?: boolean;
  rightPanelWidth?: number;
  isRightPanelOpen?: boolean;
}

function detectPlatform() {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('mac')) {
    return 'macos';
  } else if (userAgent.includes('win')) {
    return 'windows';
  } else {
    return 'linux';
  }
}

/**
 * Custom title bar component for Tauri window without decorations
 * Supports macOS (traffic lights on left) and Windows/Linux (controls on right)
 * Can integrate with app content to save vertical space
 */
export function TitleBar({
  leftContent,
  rightContent,
  onClose,
  sidebarZoneWidth,
  isSidebarCollapsed = false,
  rightPanelWidth = 0,
  isRightPanelOpen = false,
}: TitleBarProps = {}) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const platform = detectPlatform();

  useEffect(() => {
    // Get initial window states
    const appWindow = getCurrentWindow();
    appWindow.isMaximized().then(setIsMaximized);
    appWindow
      .isFullscreen()
      .then(setIsFullscreen)
      .catch(() => {
        // isFullscreen might not be available on all platforms
      });

    // Check window states on window resize
    // This handles cases where window is maximized/unmaximized by other means (e.g., double-click)
    const checkWindowState = async () => {
      try {
        const maximized = await appWindow.isMaximized();
        setIsMaximized(maximized);
        const fullscreen = await appWindow.isFullscreen();
        setIsFullscreen(fullscreen);
      } catch (_) {
        // Silently handle errors (e.g., window closed)
      }
    };

    // Use a debounced resize handler to avoid excessive checks
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(checkWindowState, 100);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  const handleMinimize = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
    } catch (error) {
      logger.error('Error minimizing window:', error);
    }
  };

  const handleMaximize = async (e: React.MouseEvent) => {
    try {
      const appWindow = getCurrentWindow();

      // On macOS, the green button should toggle fullscreen (like native behavior)
      // Option+Click should maximize instead
      if (isMacOSPlatform) {
        const isOptionPressed = e.altKey || e.metaKey;

        if (isOptionPressed) {
          // Option+Click: Maximize (not fullscreen)
          await appWindow.toggleMaximize();
          const maximized = await appWindow.isMaximized();
          setIsMaximized(maximized);
        } else {
          // Normal click: Toggle fullscreen (native macOS behavior)
          const currentFullscreen = await appWindow.isFullscreen();
          await appWindow.setFullscreen(!currentFullscreen);
          const fullscreen = await appWindow.isFullscreen();
          setIsFullscreen(fullscreen);
        }
      } else {
        // Windows/Linux: Toggle maximize
        await appWindow.toggleMaximize();
        const maximized = await appWindow.isMaximized();
        setIsMaximized(maximized);
      }
    } catch (error) {
      logger.error('Error toggling maximize/fullscreen:', error);
    }
  };

  const handleClose = async () => {
    // If custom onClose handler is provided, use it instead of closing the window
    if (onClose) {
      onClose();
      return;
    }

    try {
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch (error) {
      logger.error('Error closing window:', error);
    }
  };

  const isMacOSPlatform = platform === 'macos';

  // Handle double-click on title bar to toggle fullscreen (Windows/Linux)
  // This avoids the gap issue when decorations are disabled
  // macOS doesn't use this behavior, so we only apply it to Windows/Linux
  const handleTitleBarDoubleClick = async (e: React.MouseEvent) => {
    // Skip on macOS
    if (isMacOSPlatform) return;

    // Only handle if clicking on the draggable area, not on buttons or their containers
    const target = e.target as HTMLElement;
    const isButton = target.closest('button') !== null;

    if (
      !isButton &&
      (e.target === e.currentTarget ||
        target.hasAttribute('data-tauri-drag-region'))
    ) {
      e.preventDefault();
      try {
        const appWindow = getCurrentWindow();
        // Use fullscreen instead of maximize to avoid gap when decorations are disabled
        const currentFullscreen = await appWindow.isFullscreen();
        await appWindow.setFullscreen(!currentFullscreen);
        const fullscreen = await appWindow.isFullscreen();
        setIsFullscreen(fullscreen);
      } catch (error) {
        logger.error('Error toggling fullscreen on double-click:', error);
        // Fallback to maximize if fullscreen fails
        const appWindow = getCurrentWindow();
        await appWindow.toggleMaximize();
        const maximized = await appWindow.isMaximized();
        setIsMaximized(maximized);
      }
    }
  };

  return (
    <div className="flex h-8 w-full select-none">
      {/* Sidebar column — matches sidebar below */}
      <div
        data-tauri-drag-region={isMacOSPlatform ? undefined : true}
        onDoubleClick={handleTitleBarDoubleClick}
        className={cn(
          'flex shrink-0 min-w-0',
          isSidebarCollapsed ? 'bg-background' : 'bg-sidebar'
        )}
        style={
          !isSidebarCollapsed && sidebarZoneWidth
            ? { width: sidebarZoneWidth }
            : undefined
        }
      >
        <SidebarColumnRow
          className="w-full"
          leading={
            isMacOSPlatform ? (
              <>
                <button
                  onClick={handleClose}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="group flex h-3 w-3 items-center justify-center rounded-full bg-window-close transition-colors hover:bg-window-close-hover"
                  aria-label="Close"
                >
                  <span className="opacity-0 group-hover:opacity-100">
                    <X className="h-2 w-2 text-window-close-icon" />
                  </span>
                </button>
                <button
                  onClick={handleMinimize}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="group flex h-3 w-3 items-center justify-center rounded-full bg-window-minimize transition-colors hover:bg-window-minimize-hover"
                  aria-label="Minimize"
                >
                  <span className="opacity-0 group-hover:opacity-100">
                    <Minus className="h-2 w-2 text-window-minimize-icon" />
                  </span>
                </button>
                <button
                  onClick={handleMaximize}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="group flex h-3 w-3 items-center justify-center rounded-full bg-window-maximize transition-colors hover:bg-window-maximize-hover"
                  aria-label={
                    isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'
                  }
                  title={
                    isFullscreen
                      ? 'Exit Fullscreen (Option+Click to Maximize)'
                      : 'Enter Fullscreen (Option+Click to Maximize)'
                  }
                >
                  <span className="opacity-0 group-hover:opacity-100">
                    {isFullscreen ? (
                      <Maximize2 className="h-2 w-2 text-window-maximize-icon" />
                    ) : (
                      <Square className="h-2 w-2 text-window-maximize-icon" />
                    )}
                  </span>
                </button>
              </>
            ) : undefined
          }
        >
          {leftContent ? (
            <div onMouseDown={(e) => e.stopPropagation()} className="flex">
              {leftContent}
            </div>
          ) : null}
        </SidebarColumnRow>
      </div>

      {/* Main column — seamless with main content below */}
      <div
        data-tauri-drag-region
        onDoubleClick={handleTitleBarDoubleClick}
        className="flex min-w-0 flex-1 items-center bg-background"
      >
        <div
          data-tauri-drag-region
          className={cn(
            'h-full flex-1',
            isMacOSPlatform &&
              !leftContent &&
              'flex items-center justify-center'
          )}
        >
          {isMacOSPlatform && !leftContent ? (
            <span className="text-xs font-medium text-muted-foreground">
              Nexo
            </span>
          ) : null}
        </div>
      </div>

      {/* Right panel column — aligns with right panel below when open */}
      <div
        className={cn(
          'flex shrink-0 items-center transition-colors',
          isRightPanelOpen && rightPanelWidth > 0
            ? 'border-l border-border/50 bg-sidebar'
            : 'bg-background',
          isRightPanelOpen && rightPanelWidth > 0 && 'justify-end'
        )}
        style={
          isRightPanelOpen && rightPanelWidth > 0
            ? { width: rightPanelWidth }
            : undefined
        }
      >
        {rightContent ? (
          <div
            className={cn(
              'flex min-w-0 items-center gap-1',
              isRightPanelOpen && rightPanelWidth > 0
                ? 'flex-1 justify-start px-3'
                : 'px-1'
            )}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {rightContent}
          </div>
        ) : null}

        {!isMacOSPlatform ? (
          <div className="flex items-center">
            <button
              onClick={handleMinimize}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex h-8 w-11 items-center justify-center transition-colors hover:bg-accent"
              aria-label="Minimize"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => handleMaximize(e)}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex h-8 w-11 items-center justify-center transition-colors hover:bg-accent"
              aria-label={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? (
                <Maximize2 className="h-3.5 w-3.5" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={handleClose}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex h-8 w-11 items-center justify-center transition-colors hover:bg-destructive hover:text-destructive-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : rightContent ? null : (
          <div className="w-3" />
        )}
      </div>
    </div>
  );
}
