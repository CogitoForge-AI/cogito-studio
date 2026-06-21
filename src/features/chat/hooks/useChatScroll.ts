import { useEffect, useRef, type RefObject } from 'react';

function scrollToBottom(scrollAreaRef: RefObject<HTMLDivElement | null>) {
  const viewport = scrollAreaRef.current?.querySelector(
    '[data-slot="scroll-area-viewport"]'
  ) as HTMLElement | null;
  if (viewport) {
    viewport.scrollTop = viewport.scrollHeight;
  }
}

export function useChatScroll(chatId: string | null, messageCount: number) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastScrolledChatIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!chatId) {
      lastScrolledChatIdRef.current = null;
      return;
    }

    if (lastScrolledChatIdRef.current === chatId) return;
    if (messageCount === 0) return;

    scrollToBottom(scrollAreaRef);
    lastScrolledChatIdRef.current = chatId;
  }, [chatId, messageCount]);

  return {
    scrollAreaRef,
    contentRef,
  };
}
