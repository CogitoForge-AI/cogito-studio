import { Check, Copy, ExternalLink, Maximize2, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import * as opener from '@tauri-apps/plugin-opener';
import { Button } from '@/ui/atoms/button/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/ui/atoms/dialog';
import { logger } from '@/lib/logger';
import type { Artifact } from '../../types';

export interface ArtifactViewerFullscreenConfig {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  content: ReactNode;
}

interface ArtifactViewerHeaderProps {
  artifact: Artifact;
  onReload?: () => void;
  reloading?: boolean;
  copyContent?: string | null;
  fullscreen?: ArtifactViewerFullscreenConfig | null;
}

export function ArtifactViewerHeader({
  artifact,
  onReload,
  reloading = false,
  copyContent,
  fullscreen,
}: ArtifactViewerHeaderProps) {
  const { t } = useTranslation('artifacts');
  const [copied, setCopied] = useState(false);
  const [internalFullscreenOpen, setInternalFullscreenOpen] = useState(false);
  const copiedTimeoutRef = useRef<number>();

  const isFullscreen = fullscreen?.open ?? internalFullscreenOpen;
  const setFullscreenOpen =
    fullscreen?.onOpenChange ?? setInternalFullscreenOpen;

  useEffect(
    () => () => {
      if (copiedTimeoutRef.current) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    },
    []
  );

  const handleOpenInSystem = async () => {
    try {
      await opener.openPath(artifact.path);
    } catch (error) {
      logger.error('[ArtifactViewerHeader] Failed to open in system:', error);
    }
  };

  const handleCopyContent = async () => {
    if (!copyContent || !navigator.clipboard?.writeText) return;

    try {
      await navigator.clipboard.writeText(copyContent);
      setCopied(true);
      copiedTimeoutRef.current = window.setTimeout(
        () => setCopied(false),
        2000
      );
    } catch (error) {
      logger.error('[ArtifactViewerHeader] Failed to copy content:', error);
    }
  };

  const canCopy = Boolean(copyContent);
  const canFullscreen = Boolean(fullscreen?.content);

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {artifact.title}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {artifact.filename}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onReload ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={reloading}
              onClick={onReload}
              aria-label={t('viewerReload')}
            >
              <RotateCw className={cnIcon(reloading)} aria-hidden />
            </Button>
          ) : null}
          {canCopy ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => void handleCopyContent()}
              aria-label={copied ? t('copyContentDone') : t('copyContent')}
            >
              {copied ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
            </Button>
          ) : null}
          {canFullscreen ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setFullscreenOpen(true)}
              aria-label={t('viewerFullscreen')}
            >
              <Maximize2 className="size-3.5" aria-hidden />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => void handleOpenInSystem()}
          >
            <ExternalLink className="size-3.5" aria-hidden />
            {t('openInSystem')}
          </Button>
        </div>
      </div>

      {canFullscreen ? (
        <Dialog open={isFullscreen} onOpenChange={setFullscreenOpen}>
          <DialogContent className="flex max-h-[95vh] h-[95vh] w-[98vw] max-w-none! flex-col border-none bg-background/95 p-0 backdrop-blur-sm">
            <DialogTitle className="sr-only">
              {t('viewerFullscreenTitle', { title: artifact.title })}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t('viewerFullscreenDescription')}
            </DialogDescription>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {isFullscreen ? fullscreen?.content : null}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function cnIcon(spinning: boolean) {
  return spinning ? 'size-3.5 animate-spin' : 'size-3.5';
}
