import { baseApi } from '@/app/api/baseApi';
import { TauriCommands } from '@/bindings/commands';
import type { Message } from '../types';
import { extractCodeBlocks } from '@/features/chat/lib/code-block-extractor';

interface DbMessage {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  timestamp: number; // Unix timestamp in milliseconds
  assistant_message_id: string | null;
  tool_call_id: string | null;
  reasoning: string | null;
  metadata: string | null;
}

export const messagesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMessages: builder.query<Message[], string>({
      query: (chatId) => ({
        command: TauriCommands.GET_MESSAGES,
        args: { chatId },
      }),
      transformResponse: (response: DbMessage[]) => {
        return response.map((m) => {
          const codeBlocks = extractCodeBlocks(m.content);
          let tokenUsage;
          if (m.metadata) {
            try {
              const parsed = JSON.parse(m.metadata);
              if (parsed.tokenUsage) {
                const tu = parsed.tokenUsage;
                tokenUsage = {
                  promptTokens: tu.prompt_tokens,
                  completionTokens: tu.completion_tokens,
                  totalTokens: tu.total_tokens,
                };
              }
            } catch {
              // Ignore parse error
            }
          }

          return {
            id: m.id,
            role: m.role as 'user' | 'assistant' | 'tool' | 'tool_call',
            content: m.content,
            timestamp: m.timestamp,
            assistantMessageId: m.assistant_message_id ?? undefined,
            codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
            reasoning: m.reasoning ?? undefined,
            metadata: m.metadata ?? undefined,
            tokenUsage,
            toolCallId: m.tool_call_id ?? undefined,
          };
        });
      },
      providesTags: (_result, _error, chatId) => [
        { type: 'Message', id: `LIST_${chatId}` },
      ],
    }),
    sendMessage: builder.mutation<
      {
        turn_id: string;
        assistant_message_id: string;
        user_message_id: string;
        status: 'started' | 'queued';
        queue_depth: number;
      },
      {
        chatId: string;
        content: string;
        selectedModel?: string;
        reasoningEffort?: string;
      }
    >({
      query: (body) => ({
        command: TauriCommands.SEND_MESSAGE,
        args: body,
      }),
      // Response is handled via events, so we don't strictly need invalidatesTags if events update cache.
      // But start event invalidates LIST tag.
    }),
    createMessage: builder.mutation<
      void,
      {
        id: string;
        chatId: string;
        role: string;
        content: string;
        timestamp: number;
        assistantMessageId?: string | null;
        toolCallId?: string | null;
      }
    >({
      query: (body) => ({
        command: TauriCommands.CREATE_MESSAGE,
        args: body,
      }),
      invalidatesTags: (_result, _error, { chatId }) => [
        { type: 'Message', id: `LIST_${chatId}` },
      ],
    }),
    updateMessage: builder.mutation<
      void,
      {
        id: string;
        content: string;
        reasoning?: string | null;
        timestamp?: number | null;
      }
    >({
      query: (body) => ({
        command: TauriCommands.UPDATE_MESSAGE,
        args: body,
      }),
      invalidatesTags: [], // We rely on manual invalidation or specific chat invalidation by caller
    }),
  }),
});

export const {
  useGetMessagesQuery,
  useSendMessageMutation,
  useCreateMessageMutation,
  useUpdateMessageMutation,
} = messagesApi;
