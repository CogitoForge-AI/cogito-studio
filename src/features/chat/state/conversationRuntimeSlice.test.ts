import { describe, expect, it } from 'vitest';
import {
  activeStreamingMessageId,
  isActiveConversationPhase,
  type ConversationRuntimeEntry,
} from './conversationRuntimeSlice';

describe('conversationRuntimeSlice helpers', () => {
  it('treats running phases as active', () => {
    expect(isActiveConversationPhase('running_llm')).toBe(true);
    expect(isActiveConversationPhase('waiting_user')).toBe(true);
    expect(isActiveConversationPhase('idle')).toBe(false);
    expect(isActiveConversationPhase('completed')).toBe(false);
  });

  it('derives active streaming message id from runtime', () => {
    const runtime: ConversationRuntimeEntry = {
      phase: {
        kind: 'running_llm',
        turn_id: 'turn-1',
        active_message_id: 'msg-1',
        iteration: 0,
        tool_call_id: null,
        error: null,
      },
      queue_depth: 0,
      lastUpdatedAt: Date.now(),
    };

    expect(activeStreamingMessageId(runtime)).toBe('msg-1');
    expect(activeStreamingMessageId(undefined)).toBeNull();
  });

  it('returns null streaming id when turn is idle', () => {
    const runtime: ConversationRuntimeEntry = {
      phase: {
        kind: 'idle',
        turn_id: null,
        active_message_id: 'msg-1',
        iteration: null,
        tool_call_id: null,
        error: null,
      },
      queue_depth: 0,
      lastUpdatedAt: Date.now(),
    };

    expect(activeStreamingMessageId(runtime)).toBeNull();
  });
});
