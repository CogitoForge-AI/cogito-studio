import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  fetchChats,
  createChat,
  setSelectedChat,
  removeChat,
  updateChatTitle,
} from '../state/chatsSlice';
import { showError } from '@/features/notifications/state/notificationSlice';
import { setAttachedFiles } from '../state/chatInputSlice';
import { logger } from '@/lib/logger';
import { invokeCommand, TauriCommands } from '@/lib/tauri';
import { isActiveConversationPhase } from '../state/conversationRuntimeSlice';

/**
 * Hook to access and manage chats
 */
export function useChats(selectedWorkspaceId: string | null) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['common', 'settings']);

  const chatsByWorkspaceId = useAppSelector(
    (state) => state.chats.chatsByWorkspaceId
  );

  const chats = useMemo(() => {
    if (!selectedWorkspaceId) return [];
    return chatsByWorkspaceId[selectedWorkspaceId] || [];
  }, [selectedWorkspaceId, chatsByWorkspaceId]);

  const selectedChatId = useAppSelector((state) => state.chats.selectedChatId);
  const conversationRuntime = useAppSelector(
    (state) => state.conversationRuntime.byChatId
  );

  useEffect(() => {
    if (!selectedWorkspaceId) return;

    if (selectedWorkspaceId in chatsByWorkspaceId) {
      return;
    }

    let isMounted = true;
    dispatch(fetchChats(selectedWorkspaceId)).then((result) => {
      if (!isMounted) return;
      if (fetchChats.fulfilled.match(result)) {
        // Chat fetching completed
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedWorkspaceId, dispatch, chatsByWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId) return;

    const workspaceChats = chatsByWorkspaceId[selectedWorkspaceId];
    if (workspaceChats && workspaceChats.length > 0) {
      const isCurrentChatInWorkspace = workspaceChats.some(
        (c) => c.id === selectedChatId
      );
      if (!isCurrentChatInWorkspace) {
        dispatch(setSelectedChat(workspaceChats[0].id));
      }
    }
  }, [selectedWorkspaceId, selectedChatId, chatsByWorkspaceId, dispatch]);

  const handleNewChat = async () => {
    if (!selectedWorkspaceId) return;

    if (selectedChatId) {
      const currentChat = chats.find((c) => c.id === selectedChatId);
      if (currentChat && !currentChat.lastMessage && !currentChat.parentId) {
        dispatch(removeChat(selectedChatId));
      }
    }

    try {
      await dispatch(
        createChat({
          workspaceId: selectedWorkspaceId,
          title: t('newConversation', { ns: 'common' }),
        })
      ).unwrap();
    } catch (error) {
      logger.error('Error creating new chat:', error);
      dispatch(showError(t('cannotCreateChat', { ns: 'settings' })));
    }
  };

  const handleChatSelect = (chatId: string) => {
    if (selectedChatId && selectedChatId !== chatId) {
      const prevChat = chats.find((c) => c.id === selectedChatId);
      if (prevChat && !prevChat.lastMessage && !prevChat.parentId) {
        dispatch(removeChat(selectedChatId));
      }
    }

    dispatch(setSelectedChat(chatId));
    dispatch(setAttachedFiles([]));
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      const runtime = conversationRuntime[chatId];
      if (runtime && isActiveConversationPhase(runtime.phase.kind)) {
        await invokeCommand(TauriCommands.CANCEL_MESSAGE, { chatId });
      }

      await dispatch(removeChat(chatId)).unwrap();

      if (selectedChatId === chatId) {
        const remainingChats = chats.filter((chat) => chat.id !== chatId);
        if (remainingChats.length > 0) {
          dispatch(setSelectedChat(remainingChats[0].id));
        } else if (selectedWorkspaceId) {
          await handleNewChat();
        }
      }
    } catch (error) {
      logger.error('Error deleting chat:', error);
      dispatch(showError(t('cannotDeleteChat', { ns: 'settings' })));
      throw error;
    }
  };

  const handleRenameChat = async (chatId: string, newTitle: string) => {
    try {
      await dispatch(
        updateChatTitle({
          id: chatId,
          title: newTitle,
        })
      ).unwrap();
    } catch (error) {
      logger.error('Error renaming chat:', error);
      dispatch(showError(t('cannotRenameChat', { ns: 'settings' })));
      throw error;
    }
  };

  return {
    chats,
    selectedChatId,
    conversationRuntime,
    handleNewChat,
    handleChatSelect,
    handleDeleteChat,
    handleRenameChat,
  };
}
