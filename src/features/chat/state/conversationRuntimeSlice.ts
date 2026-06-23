import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type ConversationPhaseKind =
  | 'idle'
  | 'queued'
  | 'running_llm'
  | 'running_tools'
  | 'waiting_user'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ConversationPhase {
  kind: ConversationPhaseKind;
  turn_id: string | null;
  active_message_id: string | null;
  iteration: number | null;
  tool_call_id: string | null;
  error: string | null;
}

export interface ConversationRuntimeEntry {
  phase: ConversationPhase;
  queue_depth: number;
  lastUpdatedAt: number;
}

export interface ConversationSnapshot {
  chat_id: string;
  phase: ConversationPhase;
  queue_depth: number;
}

export interface ConversationSummary {
  chat_id: string;
  phase: ConversationPhase;
  queue_depth: number;
}

interface ConversationRuntimeState {
  byChatId: Record<string, ConversationRuntimeEntry>;
}

const initialState: ConversationRuntimeState = {
  byChatId: {},
};

export function isActiveConversationPhase(
  kind: ConversationPhaseKind
): boolean {
  return (
    kind === 'queued' ||
    kind === 'running_llm' ||
    kind === 'running_tools' ||
    kind === 'waiting_user'
  );
}

export function activeStreamingMessageId(
  runtime: ConversationRuntimeEntry | undefined
): string | null {
  if (!runtime) return null;
  if (!isActiveConversationPhase(runtime.phase.kind)) return null;
  return runtime.phase.active_message_id;
}

function shouldClearRuntime(
  phase: ConversationPhase,
  queueDepth: number
): boolean {
  return !isActiveConversationPhase(phase.kind) && queueDepth === 0;
}

const conversationRuntimeSlice = createSlice({
  name: 'conversationRuntime',
  initialState,
  reducers: {
    setConversationSnapshot: (
      state,
      action: PayloadAction<ConversationSnapshot>
    ) => {
      const { chat_id, phase, queue_depth } = action.payload;
      if (shouldClearRuntime(phase, queue_depth)) {
        delete state.byChatId[chat_id];
        return;
      }

      state.byChatId[chat_id] = {
        phase,
        queue_depth,
        lastUpdatedAt: Date.now(),
      };
    },
    setConversationPhase: (
      state,
      action: PayloadAction<{
        chatId: string;
        phase: ConversationPhase;
        queueDepth?: number;
      }>
    ) => {
      const { chatId, phase, queueDepth } = action.payload;
      const existing = state.byChatId[chatId];
      const nextQueueDepth = queueDepth ?? existing?.queue_depth ?? 0;

      if (shouldClearRuntime(phase, nextQueueDepth)) {
        delete state.byChatId[chatId];
        return;
      }

      state.byChatId[chatId] = {
        phase,
        queue_depth: nextQueueDepth,
        lastUpdatedAt: Date.now(),
      };
    },
    setTurnQueued: (
      state,
      action: PayloadAction<{
        chatId: string;
        turnId: string;
        assistantMessageId: string;
        queueDepth: number;
      }>
    ) => {
      const { chatId, turnId, assistantMessageId, queueDepth } = action.payload;
      state.byChatId[chatId] = {
        phase: {
          kind: 'queued',
          turn_id: turnId,
          active_message_id: assistantMessageId,
          iteration: null,
          tool_call_id: null,
          error: null,
        },
        queue_depth: queueDepth,
        lastUpdatedAt: Date.now(),
      };
    },
    setTurnStarted: (
      state,
      action: PayloadAction<{
        chatId: string;
        turnId: string;
        assistantMessageId: string;
      }>
    ) => {
      const { chatId, turnId, assistantMessageId } = action.payload;
      state.byChatId[chatId] = {
        phase: {
          kind: 'running_llm',
          turn_id: turnId,
          active_message_id: assistantMessageId,
          iteration: 0,
          tool_call_id: null,
          error: null,
        },
        queue_depth: state.byChatId[chatId]?.queue_depth ?? 0,
        lastUpdatedAt: Date.now(),
      };
    },
    clearConversationRuntime: (state, action: PayloadAction<string>) => {
      delete state.byChatId[action.payload];
    },
  },
});

export const {
  setConversationSnapshot,
  setConversationPhase,
  setTurnQueued,
  setTurnStarted,
  clearConversationRuntime,
} = conversationRuntimeSlice.actions;

export default conversationRuntimeSlice.reducer;
