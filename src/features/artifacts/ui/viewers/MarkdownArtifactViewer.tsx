import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '@/ui/atoms/scroll-area';
import { logger } from '@/lib/logger';
import { readArtifactTextFile } from '../../lib/readArtifactText';
import type { Artifact } from '../../types';
import { ArtifactMarkdownContent } from './ArtifactMarkdownContent';
import { ArtifactViewerHeader } from './ArtifactViewerHeader';

interface MarkdownArtifactViewerProps {
  artifact: Artifact;
}

export function MarkdownArtifactViewer({
  artifact,
}: MarkdownArtifactViewerProps) {
  const { t } = useTranslation('artifacts');
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);

  const fetchKey = `${artifact.path}:${reloadNonce}`;
  const loading = resolvedKey !== fetchKey;

  useEffect(() => {
    let cancelled = false;

    readArtifactTextFile(artifact.path)
      .then((text) => {
        if (cancelled) return;
        setContent(text);
        setError(null);
        setResolvedKey(fetchKey);
      })
      .catch((readError) => {
        if (cancelled) return;
        logger.error(
          '[MarkdownArtifactViewer] Failed to read file:',
          readError
        );
        setError(t('viewerLoadError'));
        setContent(null);
        setResolvedKey(fetchKey);
      });

    return () => {
      cancelled = true;
    };
  }, [artifact.path, fetchKey, t]);

  const handleReload = () => {
    setReloadNonce((value) => value + 1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ArtifactViewerHeader
        artifact={artifact}
        onReload={handleReload}
        reloading={loading}
        copyContent={content}
        fullscreen={
          content !== null && !loading && !error
            ? {
                content: (
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="select-text px-4 py-3">
                      <ArtifactMarkdownContent content={content} />
                    </div>
                  </ScrollArea>
                ),
              }
            : null
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="select-text px-3 py-3">
          {loading ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              {t('loading')}
            </div>
          ) : error ? (
            <div className="py-10 text-center text-sm text-destructive">
              {error}
            </div>
          ) : content !== null ? (
            <ArtifactMarkdownContent content={content} />
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
