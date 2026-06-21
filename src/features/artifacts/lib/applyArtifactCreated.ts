import type { AppDispatch, RootState } from '@/app/store';
import { store } from '@/app/store';
import { openArtifactsInRightPanel } from '@/features/ui/state/uiSlice';
import { artifactsApi } from '../state/artifactsApi';
import type { Artifact } from '../types';

/** Refresh artifact cache, prefetch from backend, and reveal the artifacts tab. */
export function applyArtifactCreated(
  dispatch: AppDispatch,
  chatId: string,
  artifact?: Artifact,
  state: RootState = store.getState()
): void {
  if (artifact) {
    const cached = artifactsApi.endpoints.getArtifacts.select(chatId)(state);

    if (cached?.data) {
      dispatch(
        artifactsApi.util.updateQueryData('getArtifacts', chatId, (draft) => {
          const index = draft.findIndex((entry) => entry.id === artifact.id);
          if (index >= 0) {
            draft[index] = artifact;
            return;
          }
          draft.unshift(artifact);
        })
      );
    } else {
      dispatch(
        artifactsApi.util.upsertQueryData('getArtifacts', chatId, [artifact])
      );
    }
  } else {
    dispatch(
      artifactsApi.util.invalidateTags([{ type: 'Artifact', id: chatId }])
    );
    void dispatch(
      artifactsApi.endpoints.getArtifacts.initiate(chatId, {
        forceRefetch: true,
        subscribe: false,
      })
    );
  }

  dispatch(openArtifactsInRightPanel());
}
