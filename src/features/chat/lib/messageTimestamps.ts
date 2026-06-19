import type { Message } from '../types';

export function getMaxMessageTimestamp(messages: Message[]): number {
  let max = 0;
  for (const message of messages) {
    if (message.timestamp > max) {
      max = message.timestamp;
    }
  }
  return max;
}

export function nextTurnMessageTimestamps(
  messages: Message[],
  includeUser: boolean
): { userTimestamp: number; assistantTimestamp: number } {
  const maxTimestamp = getMaxMessageTimestamp(messages);

  if (includeUser) {
    return {
      userTimestamp: maxTimestamp + 1,
      assistantTimestamp: maxTimestamp + 2,
    };
  }

  return {
    userTimestamp: 0,
    assistantTimestamp: maxTimestamp + 1,
  };
}

export function nextToolCallTimestamp(
  messages: Message[],
  assistantMessageId: string
): number {
  const assistant = messages.find((m) => m.id === assistantMessageId);
  let maxTimestamp = assistant?.timestamp ?? getMaxMessageTimestamp(messages);

  for (const message of messages) {
    if (
      message.role === 'tool_call' &&
      message.assistantMessageId === assistantMessageId &&
      message.timestamp > maxTimestamp
    ) {
      maxTimestamp = message.timestamp;
    }
  }

  return maxTimestamp + 1;
}

export function toolCallMessageId(toolCallId: string): string {
  return `tool_call_${toolCallId}`;
}
