import type { ReactNode } from 'react';
import { ScrollArea } from '@/ui/atoms/scroll-area';
import { useChatScroll } from '../../hooks/useChatScroll';

interface ChatScrollAreaProps {
  chatId: string | null;
  messageCount: number;
  children: ReactNode;
}

export function ChatScrollArea({
  chatId,
  messageCount,
  children,
}: ChatScrollAreaProps) {
  const { contentRef, scrollAreaRef } = useChatScroll(chatId, messageCount);

  return (
    <ScrollArea ref={scrollAreaRef} className="flex-1 py-4">
      <div ref={contentRef}>{children}</div>
    </ScrollArea>
  );
}
