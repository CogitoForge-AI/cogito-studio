import { useState, useCallback } from 'react';
import { logger } from '@/lib/logger';
import { copyMarkdownToClipboard } from '@/lib/clipboard';

export interface UseMessageListStateProps {
  externalMarkdownEnabled?: Record<string, boolean>;
  externalCopiedId?: string | null;
  onMarkdownEnabledChange?: (markdownEnabled: Record<string, boolean>) => void;
  onCopiedIdChange?: (copiedId: string | null) => void;
}

export function useMessageListState({
  externalMarkdownEnabled,
  externalCopiedId,
  onMarkdownEnabledChange,
  onCopiedIdChange,
}: UseMessageListStateProps) {
  // Internal state
  const [internalMarkdownEnabled, setInternalMarkdownEnabled] = useState<
    Record<string, boolean>
  >({});
  const [internalCopiedId, setInternalCopiedId] = useState<string | null>(null);

  // Derived state (effective state)
  const markdownEnabled = externalMarkdownEnabled ?? internalMarkdownEnabled;
  const copiedId = externalCopiedId ?? internalCopiedId;

  const handleCopy = useCallback(
    async (content: string, messageId: string) => {
      try {
        await copyMarkdownToClipboard(content);
        if (onCopiedIdChange) {
          onCopiedIdChange(messageId);
        } else {
          setInternalCopiedId(messageId);
        }
        setTimeout(() => {
          if (onCopiedIdChange) {
            onCopiedIdChange(null);
          } else {
            setInternalCopiedId(null);
          }
        }, 2000);
      } catch (error) {
        logger.error('Failed to copy content:', error);
      }
    },
    [onCopiedIdChange]
  );

  const toggleMarkdown = useCallback(
    (messageId: string) => {
      // If undefined, treat as true (markdown enabled by default)
      const currentValue = markdownEnabled[messageId] ?? true;
      const newValue = {
        ...markdownEnabled,
        [messageId]: !currentValue,
      };
      if (onMarkdownEnabledChange) {
        onMarkdownEnabledChange(newValue);
      } else {
        setInternalMarkdownEnabled(newValue);
      }
    },
    [markdownEnabled, onMarkdownEnabledChange]
  );

  return {
    markdownEnabled,
    copiedId,
    handleCopy,
    toggleMarkdown,
  };
}
