import { useEffect, useRef } from 'react';
import { useStickToBottom } from 'use-stick-to-bottom';

export function useChatScroll(isStreaming = false) {
  // Setup auto scroll hook
  const { scrollRef, contentRef } = useStickToBottom({
    resize: isStreaming ? 'instant' : 'smooth',
    initial: 'smooth',
    damping: 0.15,
    stiffness: 0.08,
    mass: 1,
  });

  // Refs for ScrollArea
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Attach scrollRef to ScrollArea viewport
  useEffect(() => {
    if (scrollAreaRef.current && typeof scrollRef === 'function') {
      const viewport = scrollAreaRef.current.querySelector(
        '[data-slot="scroll-area-viewport"]'
      ) as HTMLElement;
      if (viewport) {
        scrollRef(viewport);
      }
    }
  }, [scrollRef]);

  return {
    scrollRef,
    contentRef,
    scrollAreaRef,
  };
}
