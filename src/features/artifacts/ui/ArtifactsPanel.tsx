import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { openArtifact } from '@/features/artifacts/viewers';
import { ScrollArea } from '@/ui/atoms/scroll-area';
import { logger } from '@/lib/logger';
import {
  useDeleteArtifactMutation,
  useGetArtifactsQuery,
} from '../state/artifactsApi';
import type { Artifact } from '../types';
import { ArtifactItem, ArtifactsEmptyState } from './ArtifactItem';

export function ArtifactsPanel() {
  const { t } = useTranslation(['artifacts', 'common']);
  const dispatch = useAppDispatch();
  const selectedChatId = useAppSelector((state) => state.chats.selectedChatId);
  const activeArtifactId = useAppSelector(
    (state) => state.ui.artifactViewer?.artifactId ?? null
  );

  const { data: artifacts = [], isLoading } = useGetArtifactsQuery(
    selectedChatId ?? '',
    { skip: !selectedChatId }
  );

  const [deleteArtifact] = useDeleteArtifactMutation();

  const handleOpen = async (artifact: Artifact) => {
    try {
      await openArtifact(artifact, dispatch);
    } catch (error) {
      logger.error('[ArtifactsPanel] Failed to open artifact:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!selectedChatId) return;
    if (!window.confirm(t('deleteConfirm'))) return;
    await deleteArtifact({ id, chatId: selectedChatId });
  };

  if (!selectedChatId) {
    return (
      <div className="flex h-full flex-col px-3 py-3">
        <ArtifactsEmptyState
          title={t('noChatTitle')}
          description={t('noChatDescription')}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden px-3 py-3">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1.5 pb-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 opacity-50">
              <span className="text-xs">{t('loading')}</span>
            </div>
          ) : artifacts.length > 0 ? (
            artifacts.map((artifact) => (
              <ArtifactItem
                key={artifact.id}
                artifact={artifact}
                isActive={artifact.id === activeArtifactId}
                onOpen={() => handleOpen(artifact)}
                onDelete={(e) => {
                  e.stopPropagation();
                  void handleDelete(artifact.id);
                }}
              />
            ))
          ) : (
            <ArtifactsEmptyState
              title={t('emptyTitle')}
              description={t('emptyDescription')}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
