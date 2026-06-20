import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { MessageList } from './MessageList';
import { useComponentPerformance } from '@/hooks/useComponentPerformance';
import type { Message } from '../../types';
import { ScrollArea } from '@/ui/atoms/scroll-area';
import { useToolPermission } from '../../hooks/useToolPermission';
import { useChatScroll } from '../../hooks/useChatScroll';
import { CHAT_WIDTH_CLASSES } from '../ChatLayout';

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  streamingMessageId: string | null;
  onCancelToolExecution?: () => void;
  onEditMessage?: (messageId: string | null) => void;
}

export function ChatMessages({
  messages,
  isLoading,
  streamingMessageId,
  onCancelToolExecution,
  onEditMessage,
}: ChatMessagesProps) {
  // Track render performance
  useComponentPerformance({
    componentName: 'ChatMessages',
    threshold: 50,
  });

  const { t } = useTranslation('chat');

  const { pendingRequests, permissionTimeLeft, handlePermissionRespond } =
    useToolPermission();
  const { contentRef, scrollAreaRef } = useChatScroll(!!streamingMessageId);

  return (
    <ScrollArea ref={scrollAreaRef} className="flex-1 py-4">
      <MessageList
        ref={contentRef}
        messages={messages}
        enableStreaming={true}
        enablePendingPermissions={true}
        streamingMessageId={streamingMessageId}
        pendingRequests={pendingRequests}
        onPermissionRespond={handlePermissionRespond}
        onCancelToolExecution={onCancelToolExecution}
        onEditingMessageIdChange={onEditMessage}
        permissionTimeLeft={permissionTimeLeft}
        t={t}
        isLoading={isLoading && !streamingMessageId}
        className={cn(CHAT_WIDTH_CLASSES, 'py-4')}
      />
    </ScrollArea>
  );
}
