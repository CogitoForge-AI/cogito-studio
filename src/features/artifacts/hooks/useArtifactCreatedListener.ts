import { useEffect } from 'react';
import { listenToEvent, TauriEvents } from '@/lib/tauri';
import { store } from '@/app/store';
import { applyArtifactCreated } from '../lib/applyArtifactCreated';
import type { ArtifactCreatedEvent } from '../types';

let listenerPromise: Promise<() => void> | null = null;
let subscriberCount = 0;

function handleArtifactCreated(payload: ArtifactCreatedEvent): void {
  const selectedChatId = store.getState().chats.selectedChatId;
  if (payload.chat_id !== selectedChatId) return;

  applyArtifactCreated(store.dispatch, payload.chat_id, payload.artifact);
}

function ensureListener(): Promise<() => void> {
  if (!listenerPromise) {
    listenerPromise = listenToEvent<ArtifactCreatedEvent>(
      TauriEvents.ARTIFACT_CREATED,
      handleArtifactCreated
    );
  }
  return listenerPromise;
}

/** Singleton listener — refreshes artifacts and opens the panel when a new artifact is created. */
export function useArtifactCreatedListener(): void {
  useEffect(() => {
    subscriberCount += 1;
    void ensureListener();

    return () => {
      subscriberCount -= 1;
      if (subscriberCount > 0) return;

      subscriberCount = 0;
      const promise = listenerPromise;
      listenerPromise = null;
      void promise?.then((unlisten) => unlisten());
    };
  }, []);
}
