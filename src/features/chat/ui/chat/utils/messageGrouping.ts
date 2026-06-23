import type { Message } from '../../../types';
import type { PermissionRequest } from '@/features/tools/state/toolPermissionSlice';
import type { ToolCallData } from '../ToolCallItem';
import { parseToolCallContent } from './toolCallParsing';

export interface ActivityThinkingStep {
  kind: 'thinking';
  id: string;
  messageId: string;
  content: string;
  isStreaming: boolean;
}

export interface ActivitySnippetStep {
  kind: 'snippet';
  id: string;
  message: Message;
  isStreaming: boolean;
}

export interface ActivityToolStep {
  kind: 'tool';
  id: string;
  message?: Message;
  data: ToolCallData;
}

export type ActivityStep =
  | ActivityThinkingStep
  | ActivitySnippetStep
  | ActivityToolStep;

export interface AgentActivity {
  steps: ActivityStep[];
  defaultExpanded: boolean;
}

export type MessageRenderUnit =
  | { kind: 'user'; message: Message }
  | {
      kind: 'assistant_turn';
      message: Message;
      activity: AgentActivity | null;
      pending: PermissionRequest | null;
    };

function hasMeaningfulAssistantContent(content: string): boolean {
  return content.trim().length > 0;
}

function isActiveToolStatus(status: string): boolean {
  return (
    status === 'executing' ||
    status === 'calling' ||
    status === 'waiting_for_user' ||
    status === 'pending_permission'
  );
}

function buildStepsForAssistant(
  assistant: Message,
  toolCalls: Message[],
  streamingMessageId: string | null,
  includeSnippet: boolean
): ActivityStep[] {
  const steps: ActivityStep[] = [];
  const isStreaming =
    streamingMessageId === assistant.id &&
    !hasMeaningfulAssistantContent(assistant.content);

  if (assistant.reasoning?.trim()) {
    steps.push({
      kind: 'thinking',
      id: `thinking-${assistant.id}`,
      messageId: assistant.id,
      content: assistant.reasoning ?? '',
      isStreaming,
    });
  }

  if (includeSnippet && hasMeaningfulAssistantContent(assistant.content)) {
    steps.push({
      kind: 'snippet',
      id: `snippet-${assistant.id}`,
      message: assistant,
      isStreaming: streamingMessageId === assistant.id,
    });
  }

  for (const toolMessage of toolCalls) {
    const data = parseToolCallContent(toolMessage.content);
    if (!data) continue;
    steps.push({
      kind: 'tool',
      id: toolMessage.id,
      message: toolMessage,
      data,
    });
  }

  return steps;
}

function shouldExpandActivity(steps: ActivityStep[]): boolean {
  return steps.some((step) => {
    if (step.kind === 'thinking') return step.isStreaming;
    if (step.kind === 'tool') return isActiveToolStatus(step.data.status);
    return false;
  });
}

export function buildMessageRenderUnits(
  sortedMessages: Message[],
  options: {
    streamingMessageId?: string | null;
    pendingRequests?: Record<string, PermissionRequest>;
  } = {}
): MessageRenderUnit[] {
  const streamingMessageId = options.streamingMessageId ?? null;
  const pendingRequests = options.pendingRequests ?? {};
  const units: MessageRenderUnit[] = [];

  let index = 0;
  while (index < sortedMessages.length) {
    const message = sortedMessages[index];

    if (message.role === 'tool') {
      index += 1;
      continue;
    }

    if (message.role === 'user') {
      units.push({ kind: 'user', message });
      index += 1;
      continue;
    }

    const turnAssistants: Message[] = [];
    const turnToolCalls: Message[] = [];

    while (index < sortedMessages.length) {
      const current = sortedMessages[index];
      if (current.role === 'user') break;
      if (current.role === 'tool') {
        index += 1;
        continue;
      }
      if (current.role === 'tool_call') {
        turnToolCalls.push(current);
        index += 1;
        continue;
      }
      if (current.role === 'assistant') {
        turnAssistants.push(current);
        index += 1;
        continue;
      }
      index += 1;
    }

    if (turnAssistants.length === 0) continue;

    const finalAssistant = turnAssistants[turnAssistants.length - 1];
    const intermediateAssistants = turnAssistants.slice(0, -1);
    const toolsByAssistant = new Map<string, Message[]>();

    for (const toolCall of turnToolCalls) {
      const assistantId = toolCall.assistantMessageId ?? finalAssistant.id;
      const list = toolsByAssistant.get(assistantId) ?? [];
      list.push(toolCall);
      toolsByAssistant.set(assistantId, list);
    }

    const activitySteps: ActivityStep[] = [];

    for (const assistant of intermediateAssistants) {
      activitySteps.push(
        ...buildStepsForAssistant(
          assistant,
          toolsByAssistant.get(assistant.id) ?? [],
          streamingMessageId,
          true
        )
      );
    }

    const finalTools = toolsByAssistant.get(finalAssistant.id) ?? [];
    const finalHasOnlyContent =
      hasMeaningfulAssistantContent(finalAssistant.content) &&
      !finalAssistant.reasoning?.trim() &&
      finalTools.length === 0 &&
      streamingMessageId !== finalAssistant.id;

    if (!finalHasOnlyContent) {
      activitySteps.push(
        ...buildStepsForAssistant(
          finalAssistant,
          finalTools,
          streamingMessageId,
          false
        )
      );
    }

    const isSimpleTurn =
      turnAssistants.length === 1 &&
      activitySteps.length === 0 &&
      !pendingRequests[finalAssistant.id];

    units.push({
      kind: 'assistant_turn',
      message: finalAssistant,
      activity: isSimpleTurn
        ? null
        : {
            steps: activitySteps,
            defaultExpanded: shouldExpandActivity(activitySteps),
          },
      pending: pendingRequests[finalAssistant.id] ?? null,
    });
  }

  return units;
}

export function summarizeActivity(steps: ActivityStep[]): string {
  const toolNames: string[] = [];
  let thinkingCount = 0;

  for (const step of steps) {
    if (step.kind === 'tool') {
      toolNames.push(step.data.name);
    }
    if (step.kind === 'thinking') {
      thinkingCount += 1;
    }
  }

  const parts: string[] = [];
  if (thinkingCount > 0) {
    parts.push(thinkingCount === 1 ? '1 thought' : `${thinkingCount} thoughts`);
  }
  if (toolNames.length > 0) {
    const preview = toolNames.slice(0, 3).join(', ');
    const suffix = toolNames.length > 3 ? ` +${toolNames.length - 3}` : '';
    parts.push(`${toolNames.length} tools · ${preview}${suffix}`);
  }
  if (parts.length === 0) {
    return `${steps.length} steps`;
  }
  return parts.join(' · ');
}
