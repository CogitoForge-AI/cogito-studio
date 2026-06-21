import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { MessageList } from './MessageList';
import { ChatScrollArea } from './ChatScrollArea';
import type { Message } from '../../types';
import { useToolPermission } from '../../hooks/useToolPermission';
import { CHAT_WIDTH_CLASSES } from '../ChatLayout';

interface ChatMessagesProps {
  chatId: string | null;
  messages: Message[];
  isLoading: boolean;
  streamingMessageId: string | null;
  onCancelToolExecution?: () => void;
  onEditMessage?: (messageId: string | null) => void;
}

export function ChatMessages({
  chatId,
  messages,
  isLoading,
  streamingMessageId,
  onCancelToolExecution,
  onEditMessage,
}: ChatMessagesProps) {
  const { t } = useTranslation('chat');

  const { pendingRequests, permissionTimeLeft, handlePermissionRespond } =
    useToolPermission();

  return (
    <ChatScrollArea chatId={chatId} messageCount={messages.length}>
      <MessageList
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
    </ChatScrollArea>
  );
}
