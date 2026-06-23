import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@/app/hooks';
import { ARTIFACT_VIEWER_IDS } from '@/features/artifacts/viewers';
import { useGetArtifactsQuery } from '../state/artifactsApi';
import { ArtifactsEmptyState } from './ArtifactItem';
import { BrowserArtifactViewer } from './viewers/BrowserArtifactViewer';
import { MarkdownArtifactViewer } from './viewers/MarkdownArtifactViewer';

export function ArtifactViewerPanel() {
  const { t } = useTranslation('artifacts');
  const artifactViewer = useAppSelector((state) => state.ui.artifactViewer);

  const chatId = artifactViewer?.chatId ?? '';
  const { data: artifacts = [] } = useGetArtifactsQuery(chatId, {
    skip: !chatId,
  });

  if (!artifactViewer) {
    return (
      <div className="flex h-full flex-col px-3 py-3">
        <ArtifactsEmptyState
          title={t('viewerEmptyTitle')}
          description={t('viewerEmptyDescription')}
        />
      </div>
    );
  }

  const artifact = artifacts.find(
    (entry) => entry.id === artifactViewer.artifactId
  );

  if (!artifact) {
    return (
      <div className="flex h-full flex-col px-3 py-3">
        <ArtifactsEmptyState
          title={t('viewerEmptyTitle')}
          description={t('viewerEmptyDescription')}
        />
      </div>
    );
  }

  switch (artifactViewer.viewerId) {
    case ARTIFACT_VIEWER_IDS.browser: {
      const url = artifactViewer.payload?.url;
      if (!url) {
        return (
          <div className="flex h-full flex-col px-3 py-3">
            <ArtifactsEmptyState
              title={t('viewerLoadError')}
              description={t('viewerEmptyDescription')}
            />
          </div>
        );
      }
      return <BrowserArtifactViewer artifact={artifact} url={url} />;
    }
    case ARTIFACT_VIEWER_IDS.markdown:
      return <MarkdownArtifactViewer artifact={artifact} />;
    default:
      return (
        <div className="flex h-full flex-col px-3 py-3">
          <ArtifactsEmptyState
            title={t('viewerEmptyTitle')}
            description={t('viewerEmptyDescription')}
          />
        </div>
      );
  }
}
