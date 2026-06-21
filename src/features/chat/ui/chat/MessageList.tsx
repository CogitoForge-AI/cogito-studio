import { useMemo, useCallback, memo } from 'react';
import type { Message } from '../../types';
import type { PermissionRequest } from '@/features/tools/state/toolPermissionSlice';
import { MessageItem } from './MessageItem';
import { AgentActivityTimeline } from './AgentActivityTimeline';
import { sortMessages } from './utils/messageSorting';
import { buildMessageRenderUnits } from './utils/messageGrouping';
import { cn } from '@/lib/utils';
import { useMessageListState } from '../../hooks/useMessageListState';

interface MessageListProps {
  messages: Message[];
  markdownEnabled?: Record<string, boolean>;
  copiedId?: string | null;
  expandedToolCalls?: Record<string, boolean>;
  onMarkdownEnabledChange?: (markdownEnabled: Record<string, boolean>) => void;
  onCopiedIdChange?: (copiedId: string | null) => void;
  onEditingMessageIdChange?: (editingMessageId: string | null) => void;
  onEditingContentChange?: (editingContent: string) => void;
  onExpandedToolCallsChange?: (
    expandedToolCalls: Record<string, boolean>
  ) => void;
  enableStreaming?: boolean;
  enablePendingPermissions?: boolean;
  streamingMessageId?: string | null;
  pendingRequests?: Record<string, PermissionRequest>;
  onPermissionRespond?: (
    messageId: string,
    toolId: string,
    toolName: string,
    approved: boolean
  ) => void | Promise<void>;
  onViewAgentDetails?: (sessionId: string, agentId: string) => void;
  onCancelToolExecution?: () => void;
  t: (key: string) => string;
  isLoading?: boolean;
  className?: string;
  permissionTimeLeft?: Record<string, number>;
}

export const MessageList = memo(function MessageList({
  messages,
  markdownEnabled: externalMarkdownEnabled,
  copiedId: externalCopiedId,
  expandedToolCalls: externalExpandedToolCalls,
  onMarkdownEnabledChange,
  onCopiedIdChange,
  onEditingMessageIdChange,
  onEditingContentChange,
  onExpandedToolCallsChange,
  enableStreaming = true,
  enablePendingPermissions = true,
  streamingMessageId = null,
  pendingRequests = {},
  onPermissionRespond,
  onViewAgentDetails,
  onCancelToolExecution,
  t,
  className,
  permissionTimeLeft = {},
}: MessageListProps) {
  const {
    markdownEnabled,
    copiedId,
    expandedToolCalls,
    handleCopy,
    toggleToolCall,
  } = useMessageListState({
    externalMarkdownEnabled,
    externalCopiedId,
    externalExpandedToolCalls,
    onMarkdownEnabledChange,
    onCopiedIdChange,
    onExpandedToolCallsChange,
  });

  const handleEdit = useCallback(
    (messageId: string) => {
      const message = messages.find((m) => m.id === messageId);
      if (message) {
        onEditingMessageIdChange?.(messageId);
        onEditingContentChange?.(message.content);
      }
    },
    [messages, onEditingMessageIdChange, onEditingContentChange]
  );

  const sortedMessages = useMemo(() => sortMessages(messages), [messages]);

  const renderUnits = useMemo(
    () =>
      buildMessageRenderUnits(sortedMessages, {
        streamingMessageId: enableStreaming ? streamingMessageId : null,
        pendingRequests: enablePendingPermissions ? pendingRequests : {},
      }),
    [
      sortedMessages,
      enableStreaming,
      streamingMessageId,
      enablePendingPermissions,
      pendingRequests,
    ]
  );

  const lastRenderableMessageId = useMemo(() => {
    for (let i = renderUnits.length - 1; i >= 0; i--) {
      const unit = renderUnits[i];
      if (unit.kind === 'user') return unit.message.id;
      if (unit.kind === 'assistant_turn') {
        const { message } = unit;
        if (message.content.trim() || streamingMessageId === message.id) {
          return message.id;
        }
      }
    }
    return null;
  }, [renderUnits, streamingMessageId]);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {renderUnits.map((unit, index) => {
        const prevUnit = index > 0 ? renderUnits[index - 1] : null;
        const nextUnit =
          index < renderUnits.length - 1 ? renderUnits[index + 1] : null;
        const isTurnStart =
          prevUnit?.kind === 'user' && unit.kind === 'assistant_turn';
        const spacingClass =
          index === 0 ? undefined : isTurnStart ? 'mt-3' : 'mt-6';

        if (unit.kind === 'user') {
          const message = unit.message;
          const isMarkdownEnabled = markdownEnabled[message.id] !== false;

          return (
            <div
              key={message.id}
              className={cn(
                spacingClass,
                nextUnit?.kind === 'assistant_turn' && 'mb-1'
              )}
            >
              <MessageItem
                message={message}
                markdownEnabled={isMarkdownEnabled}
                isCopied={copiedId === message.id}
                onCopy={handleCopy}
                onEdit={handleEdit}
                onViewAgentDetails={onViewAgentDetails}
                isStreaming={false}
                isLastMessage={message.id === lastRenderableMessageId}
                t={t}
              />
            </div>
          );
        }

        const { message, activity, pending } = unit;
        const isMarkdownEnabled = markdownEnabled[message.id] !== false;
        const isStreaming =
          enableStreaming && streamingMessageId === message.id;
        const hasContent = message.content.trim().length > 0;
        const showMessage = hasContent || isStreaming;

        return (
          <div
            key={message.id}
            className={cn('flex flex-col gap-3', spacingClass)}
          >
            {activity ? (
              <AgentActivityTimeline
                activity={activity}
                expandedToolCalls={expandedToolCalls}
                onToggleToolCall={toggleToolCall}
                permissionTimeLeft={permissionTimeLeft}
                onPermissionRespond={onPermissionRespond}
                onCancelToolExecution={onCancelToolExecution}
                pending={pending}
                pendingMessageId={message.id}
                t={t}
              />
            ) : pending ? (
              <AgentActivityTimeline
                activity={{ steps: [], defaultExpanded: true }}
                expandedToolCalls={expandedToolCalls}
                onToggleToolCall={toggleToolCall}
                permissionTimeLeft={permissionTimeLeft}
                onPermissionRespond={onPermissionRespond}
                onCancelToolExecution={onCancelToolExecution}
                pending={pending}
                pendingMessageId={message.id}
                t={t}
              />
            ) : null}

            {showMessage ? (
              <MessageItem
                message={message}
                markdownEnabled={isMarkdownEnabled}
                isCopied={copiedId === message.id}
                onCopy={handleCopy}
                onEdit={handleEdit}
                onViewAgentDetails={onViewAgentDetails}
                isStreaming={isStreaming}
                isLastMessage={message.id === lastRenderableMessageId}
                t={t}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
});
