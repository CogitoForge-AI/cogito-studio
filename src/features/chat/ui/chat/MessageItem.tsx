import { useRef, useCallback, memo, useState, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { cn } from '@/lib/utils';
import { MarkdownContent } from '@/ui/organisms/markdown/MarkdownContent';
import { AgentCard } from './AgentCard';
import { MessageMentions } from './MessageMentions';
import { parseMessageMentions } from './utils/mentionUtils';
import { FLOW_NODES } from '@/ui/molecules/flow/constants';
import type { Message } from '../../types';
import { parseSkillAttachment } from '../../lib/skillAttachment';
import { SkillChip } from './SkillChip';
import { MessageAttachments } from './components/MessageAttachments';
import { MessageControls } from './components/MessageControls';
import { LazyFlowAttachment } from './LazyFlowAttachment';
import { LazyFlowEditorDialog } from './LazyFlowEditorDialog';

export interface MessageItemProps {
  message: Message;
  markdownEnabled: boolean;
  isCopied: boolean;
  isStreaming: boolean;
  isLastMessage?: boolean;
  onCopy: (content: string, messageId: string) => void;
  onEdit: (messageId: string) => void;
  onViewAgentDetails?: (sessionId: string, agentId: string) => void;
  t: (key: string) => string;
}

export const MessageItem = memo(
  function MessageItem({
    message,
    markdownEnabled,
    isCopied,
    isStreaming,
    isLastMessage = false,
    onCopy,
    onEdit,
    onViewAgentDetails,
    t,
  }: MessageItemProps) {
    const [isFlowDialogOpen, setIsFlowDialogOpen] = useState(false);

    // Determine if message is long (more than 500 characters or more than 10 lines)
    // Memoize this calculation
    const isLongMessage = useMemo(
      () =>
        message.content.length > 500 || message.content.split('\n').length > 10,
      [message.content]
    );

    // Disable collapse/expand for streaming messages
    const canCollapse = isLongMessage && !isStreaming;

    const contentRef = useRef<HTMLDivElement>(null);
    const messageRef = useRef<HTMLDivElement>(null);

    // Don't collapse by default if it's the last message or if streaming
    const [isCollapsed, setIsCollapsed] = useState(
      !isStreaming && !isLastMessage
    );

    const handleToggleCollapse = useCallback(() => {
      const newCollapsed = !isCollapsed;
      setIsCollapsed(newCollapsed);

      // If we're collapsing the message, scroll the top of the message into view
      if (newCollapsed && messageRef.current) {
        messageRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    }, [isCollapsed]);

    const handleCopy = useCallback(() => {
      onCopy(message.content, message.id);
    }, [message.content, message.id, onCopy]);

    const handleEdit = useCallback(() => {
      onEdit(message.id);
    }, [message.id, onEdit]);

    // Parse metadata only once
    const parsedMetadata = useMemo(() => {
      if (!message.metadata) return null;
      try {
        return JSON.parse(message.metadata);
      } catch {
        return null;
      }
    }, [message.metadata]);

    const agentCardData =
      parsedMetadata?.type === 'agent_card' ? parsedMetadata : null;
    const skillData = parseSkillAttachment(parsedMetadata);
    const flowData =
      parsedMetadata?.type === 'flow_attachment' ? parsedMetadata.flow : null;

    // Parse mentions once
    const { mentions, cleanedContent } = useMemo(
      () => parseMessageMentions(message.content),
      [message.content]
    );

    if (agentCardData) {
      return (
        <div
          className="flex w-full justify-start my-2"
          style={
            {
              contentVisibility: 'auto',
              containIntrinsicSize: '100px',
            } as React.CSSProperties
          }
        >
          <AgentCard
            agentId={agentCardData.agent_id}
            sessionId={agentCardData.session_id}
            status={agentCardData.status}
            onViewDetails={(sessionId) => {
              onViewAgentDetails?.(sessionId, agentCardData.agent_id);
            }}
          >
            {agentCardData.summary && (
              <MarkdownContent
                content={agentCardData.summary}
                messageId={message.id}
                isStreaming={isStreaming}
              />
            )}
          </AgentCard>
        </div>
      );
    }

    return (
      <div
        ref={messageRef}
        className={cn(
          'group flex min-w-0 w-full',
          isLastMessage &&
            'animate-in fade-in slide-in-from-bottom-3 duration-500 ease-out',
          message.role === 'user' ? 'justify-end' : 'justify-start'
        )}
        style={
          message.role === 'user'
            ? undefined
            : ({
                contentVisibility: 'auto',
                containIntrinsicSize: '100px',
              } as React.CSSProperties)
        }
      >
        <div
          className={cn(
            'relative w-fit max-w-full',
            message.role === 'assistant' ? 'w-full' : 'ml-auto'
          )}
        >
          <div
            className={cn(
              'relative min-w-0 wrap-break-words rounded-lg px-3 py-2 text-sm leading-relaxed',
              isStreaming && 'will-change-contents',
              message.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-none px-0 py-0'
            )}
            style={
              isStreaming
                ? {
                    contain: 'layout style',
                  }
                : undefined
            }
          >
            <div className="relative">
              <div
                ref={contentRef}
                className={cn(
                  'overflow-hidden transition-[max-height] duration-300 ease-in-out',
                  isStreaming ? 'select-none' : 'select-text',
                  canCollapse && isCollapsed
                    ? 'max-h-[300px]'
                    : 'max-h-[9999px]'
                )}
              >
                {/* Mentions */}
                {mentions.length > 0 && (
                  <MessageMentions
                    mentions={mentions}
                    role={message.role}
                    className={cn(message.role === 'user' ? 'opacity-90' : '')}
                  />
                )}

                {/* Attachments */}
                {parsedMetadata && (
                  <MessageAttachments
                    files={parsedMetadata.files}
                    images={parsedMetadata.images}
                    fileEntries={parsedMetadata.fileEntries}
                    role={message.role === 'user' ? 'user' : 'assistant'}
                  />
                )}

                {/* Flow Attachment */}
                {flowData && (
                  <div className="mb-2">
                    <LazyFlowAttachment
                      flow={flowData}
                      mode="message"
                      onClick={() => setIsFlowDialogOpen(true)}
                    />
                    <LazyFlowEditorDialog
                      open={isFlowDialogOpen}
                      initialFlow={flowData}
                      availableNodes={FLOW_NODES}
                      onClose={() => setIsFlowDialogOpen(false)}
                      readOnly={true}
                    />
                  </div>
                )}

                {skillData && (
                  <div className="mb-2">
                    <SkillChip
                      name={skillData.skillName}
                      description={skillData.description}
                      mode="message"
                    />
                  </div>
                )}

                {/* Content */}
                {cleanedContent && (
                  <div className="whitespace-pre-wrap wrap-break-words">
                    {message.role === 'assistant' && markdownEnabled ? (
                      <MarkdownContent
                        content={cleanedContent}
                        messageId={message.id}
                        isStreaming={isStreaming}
                      />
                    ) : (
                      cleanedContent
                    )}
                  </div>
                )}
              </div>

              {/* Gradient fade overlay when collapsed */}
              {canCollapse && isCollapsed && (
                <div
                  className={cn(
                    'absolute bottom-0 left-0 right-0 h-16 pointer-events-none',
                    message.role === 'user'
                      ? 'bg-linear-to-t from-primary to-transparent'
                      : 'bg-linear-to-t from-muted to-transparent'
                  )}
                />
              )}
            </div>

            {/* Collapse/Expand button */}
            {canCollapse && (
              <div
                className={cn(
                  'flex items-center mt-2 pt-2',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <button
                  className="text-xs opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
                  onClick={handleToggleCollapse}
                >
                  {isCollapsed ? (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      {t('showMore')}
                    </>
                  ) : (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      {t('showLess')}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          <MessageControls
            role={message.role}
            content={message.content}
            isCopied={isCopied}
            onEdit={handleEdit}
            onCopy={handleCopy}
            t={t}
            className={cn(
              'absolute z-10',
              message.role === 'user'
                ? 'right-1 bottom-1'
                : 'right-0 top-full mt-0.5'
            )}
          />
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Only re-render if relevant props change
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.content === nextProps.message.content &&
      prevProps.message.reasoning === nextProps.message.reasoning &&
      prevProps.message.codeBlocks === nextProps.message.codeBlocks &&
      prevProps.message.metadata === nextProps.message.metadata && // Include metadata for agent card updates
      prevProps.markdownEnabled === nextProps.markdownEnabled &&
      prevProps.isCopied === nextProps.isCopied &&
      prevProps.isStreaming === nextProps.isStreaming &&
      prevProps.isLastMessage === nextProps.isLastMessage
    );
  }
);
