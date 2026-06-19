import { createAsyncThunk } from '@reduxjs/toolkit';
import { invokeCommand, TauriCommands } from '@/lib/tauri';
import { extractCodeBlocks } from '@/features/chat/lib/code-block-extractor';
import type { Message } from '../../../types';

// Types matching Rust structs
interface DbMessage {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  timestamp: number;
  assistant_message_id: string | null;
  tool_call_id: string | null;
  reasoning: string | null;
  metadata: string | null;
}

export const fetchMessages = createAsyncThunk<
  { chatId: string; messages: Message[] },
  string
>('messages/fetchMessages', async (chatId: string) => {
  const dbMessages = await invokeCommand<DbMessage[]>(
    TauriCommands.GET_MESSAGES,
    { chatId }
  );
  return {
    chatId,
    messages: dbMessages.map((m) => {
      // Extract code blocks from content (content is not modified)
      const codeBlocks = extractCodeBlocks(m.content);
      return {
        id: m.id,
        role: m.role as 'user' | 'assistant' | 'tool' | 'tool_call',
        content: m.content, // Keep original content
        timestamp: m.timestamp,
        assistantMessageId: m.assistant_message_id ?? undefined,
        codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
        reasoning: m.reasoning ?? undefined,
        metadata: m.metadata ?? undefined,
      };
    }),
  };
});
