import { describe, expect, it } from 'vitest';
import type { Message } from '../types';
import {
  getMaxMessageTimestamp,
  nextToolCallTimestamp,
  nextTurnMessageTimestamps,
} from './messageTimestamps';

function msg(
  id: string,
  timestamp: number,
  role: Message['role'] = 'user'
): Message {
  return { id, role, content: '', timestamp };
}

describe('messageTimestamps', () => {
  it('uses max existing timestamp when appending turn messages', () => {
    const messages = [
      msg('a', 1_739_000_000_000_000),
      msg('b', 1_739_000_000_001_000),
    ];

    expect(nextTurnMessageTimestamps(messages, true)).toEqual({
      userTimestamp: 1_739_000_000_001_001,
      assistantTimestamp: 1_739_000_000_001_002,
    });
  });

  it('appends assistant-only timestamps after the latest message', () => {
    const messages = [msg('a', 100), msg('b', 200, 'assistant')];

    expect(nextTurnMessageTimestamps(messages, false)).toEqual({
      userTimestamp: 0,
      assistantTimestamp: 201,
    });
  });

  it('places tool calls after their parent assistant and siblings', () => {
    const messages = [
      msg('assistant', 200, 'assistant'),
      {
        id: 'tool-1',
        role: 'tool_call' as const,
        content: '{}',
        timestamp: 201,
        assistantMessageId: 'assistant',
      },
    ];

    expect(nextToolCallTimestamp(messages, 'assistant')).toBe(202);
    expect(getMaxMessageTimestamp(messages)).toBe(201);
  });
});
