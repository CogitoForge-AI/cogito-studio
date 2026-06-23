import { useCallback } from 'react';
import { invokeCommand, TauriCommands } from '@/lib/tauri';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { removePermissionRequest } from '@/features/tools/state/toolPermissionSlice';
import { messagesApi } from '../state/messagesApi';
import { logger } from '@/lib/logger';

export function useToolPermission() {
  const dispatch = useAppDispatch();
  const selectedChatId = useAppSelector((state) => state.chats.selectedChatId);
  const pendingRequests = useAppSelector(
    (state) => state.toolPermission.pendingRequests
  );

  const handlePermissionRespond = useCallback(
    async (
      messageId: string,
      toolId: string,
      toolName: string,
      approved: boolean
    ) => {
      try {
        await invokeCommand(TauriCommands.RESPOND_TOOL_PERMISSION, {
          messageId,
          approved,
          allowedToolIds: approved ? [toolId] : [],
        });

        if (!approved && selectedChatId) {
          const content = `**System Notification:** Tool \`${toolName}\` denied by user. Flow cancelled.`;
          const id = crypto.randomUUID();
          const timestamp = Date.now();

          // Persist message to backend
          await invokeCommand(TauriCommands.CREATE_MESSAGE, {
            id,
            chatId: selectedChatId,
            role: 'assistant',
            content,
            timestamp,
            assistantMessageId: null,
            toolCallId: null,
          });

          // Refresh messages (Server State)
          dispatch(
            messagesApi.util.invalidateTags([
              { type: 'Message', id: `LIST_${selectedChatId}` },
            ])
          );
        }

        dispatch(removePermissionRequest(messageId));
      } catch (error) {
        logger.error('Failed to respond to tool permission:', error);
      }
    },
    [dispatch, selectedChatId]
  );

  return {
    pendingRequests,
    handlePermissionRespond,
  };
}
