import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { invokeCommand, TauriCommands } from '@/lib/tauri';
import { removeUserQuestionRequest } from '../state/askUserSlice';
import { logger } from '@/lib/logger';

export interface UserQuestionAnswerPayload {
  questionId: string;
  optionId: string;
  freeText?: string;
}

export function useAskUser() {
  const dispatch = useAppDispatch();
  const selectedChatId = useAppSelector((state) => state.chats.selectedChatId);
  const pendingRequests = useAppSelector(
    (state) => state.askUser.pendingRequests
  );

  const pendingRequestForChat = selectedChatId
    ? Object.values(pendingRequests).find((r) => r.chatId === selectedChatId)
    : undefined;

  const hasPendingAskUser = !!pendingRequestForChat;

  const respondUserQuestion = useCallback(
    async (toolCallId: string, answers: UserQuestionAnswerPayload[]) => {
      try {
        await invokeCommand(TauriCommands.RESPOND_USER_QUESTION, {
          toolCallId,
          answers: answers.map((a) => ({
            questionId: a.questionId,
            optionId: a.optionId,
            freeText: a.freeText ?? null,
          })),
        });
        dispatch(removeUserQuestionRequest(toolCallId));
      } catch (error) {
        logger.error('Failed to respond to user question:', error);
        throw error;
      }
    },
    [dispatch]
  );

  return {
    pendingRequests,
    pendingRequestForChat,
    hasPendingAskUser,
    respondUserQuestion,
  };
}
