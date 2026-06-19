import { baseApi } from '@/app/api/baseApi';
import { TauriCommands } from '@/bindings/commands';
import type {
  ConversationSnapshot,
  ConversationSummary,
} from './conversationRuntimeSlice';

export const conversationApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getConversationState: builder.query<ConversationSnapshot, string>({
      query: (chatId) => ({
        command: TauriCommands.GET_CONVERSATION_STATE,
        args: { chatId },
      }),
    }),
    getActiveConversations: builder.query<ConversationSummary[], void>({
      query: () => ({
        command: TauriCommands.GET_ACTIVE_CONVERSATIONS,
        args: {},
      }),
    }),
  }),
});

export const { useGetConversationStateQuery, useGetActiveConversationsQuery } =
  conversationApi;
