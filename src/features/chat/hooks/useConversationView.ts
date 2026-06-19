import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  activeStreamingMessageId,
  isActiveConversationPhase,
} from '@/features/chat/state/conversationRuntimeSlice';
import { useGetConversationStateQuery } from '@/features/chat/state/conversationApi';
import { setConversationSnapshot } from '@/features/chat/state/conversationRuntimeSlice';
import { useGetMessagesQuery } from '@/features/chat/state/messagesApi';

export function useConversationView(chatId: string | null) {
  const dispatch = useAppDispatch();
  const runtime = useAppSelector((state) =>
    chatId ? state.conversationRuntime.byChatId[chatId] : undefined
  );

  const { data: snapshot } = useGetConversationStateQuery(chatId || '', {
    skip: !chatId,
    refetchOnMountOrArgChange: true,
  });

  useGetMessagesQuery(chatId || '', {
    skip: !chatId,
    refetchOnMountOrArgChange: true,
  });

  useEffect(() => {
    if (snapshot && chatId) {
      dispatch(setConversationSnapshot(snapshot));
    }
  }, [snapshot, chatId, dispatch]);

  const streamingMessageId = activeStreamingMessageId(runtime);
  const isStreaming = runtime
    ? isActiveConversationPhase(runtime.phase.kind)
    : false;
  const queueDepth = runtime?.queue_depth ?? 0;
  const phase = runtime?.phase.kind ?? 'idle';

  return {
    runtime,
    phase,
    queueDepth,
    streamingMessageId,
    isStreaming,
  };
}
