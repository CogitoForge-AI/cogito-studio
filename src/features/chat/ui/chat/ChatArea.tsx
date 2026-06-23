import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { AskUserPanel } from './AskUserPanel';
import { ImagePreviewDialog } from '@/ui/molecules/ImagePreviewDialog';
import { useMessages } from '../../hooks/useMessages';
import { useAskUser } from '../../hooks/useAskUser';
import { useWorkspaces } from '@/features/workspace';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { MAX_MESSAGE_LENGTH } from '@/lib/constants';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { sendMessage, editAndResendMessage } from '../../state/messages';
import { createChat } from '../../state/chatsSlice';
import {
  setLoading,
  clearInput,
  setInput,
  setAttachedFiles,
  setAttachedFlow,
} from '../../state/chatInputSlice';
import { showError } from '@/features/notifications/state/notificationSlice';
import { invokeCommand, TauriCommands } from '@/lib/tauri';
import { messagesApi } from '../../state/messagesApi';
import { useGetLLMConnectionsQuery } from '@/features/llm';
import { logger } from '@/lib/logger';
import { CHAT_WIDTH_CLASSES } from '../ChatLayout';
import { store } from '@/app/store';

export function ChatArea() {
  const { t } = useTranslation(['common', 'settings']);
  const dispatch = useAppDispatch();

  // Use workspaces hook to get selectedWorkspaceId and selectedLLMConnectionId
  const { selectedWorkspace, selectedWorkspaceId, workspaceSettings } =
    useWorkspaces();

  // Get selectedChatId from Redux state
  const selectedChatId = useAppSelector((state) => state.chats.selectedChatId);

  const selectedLLMConnectionId = selectedWorkspace
    ? workspaceSettings[selectedWorkspace.id]?.llmConnectionId
    : undefined;

  // Get chat input state for handleSend (read on demand to avoid re-rendering messages on every keystroke)
  const selectedModel = useAppSelector(
    (state) => state.chatInput.selectedModel
  );
  const attachedFiles = useAppSelector(
    (state) => state.chatInput.attachedFiles
  );

  const { data: llmConnections = [] } = useGetLLMConnectionsQuery();

  // Use messages hook
  const { messages, streamingMessageId, handleStopStreaming } =
    useMessages(selectedChatId);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [isSubmittingAskUser, setIsSubmittingAskUser] = useState(false);

  const { pendingRequestForChat, hasPendingAskUser, respondUserQuestion } =
    useAskUser();

  const handleEditMessage = (messageId: string | null) => {
    if (!messageId) {
      setEditingMessageId(null);
      dispatch(clearInput());
      dispatch(setAttachedFiles([]));
      return;
    }
    const message = messages.find((m) => m.id === messageId);
    if (message) {
      setEditingMessageId(messageId);
      dispatch(setInput(message.content));
      dispatch(setAttachedFiles([]));
      dispatch(setAttachedFlow(null));

      // Restore files if available (supports both old 'images' format and new 'files' format)
      try {
        if (message.metadata) {
          const parsed = JSON.parse(message.metadata);
          // Try new format first, fallback to old format
          const fileList = parsed.files || parsed.images;
          const fileEntries = Array.isArray(parsed.fileEntries)
            ? parsed.fileEntries
            : null;

          // Restore flow attachment if available
          if (parsed.type === 'flow_attachment' && parsed.flow) {
            dispatch(setAttachedFlow(parsed.flow));
          }

          if (Array.isArray(fileList) && fileList.length > 0) {
            const promises = fileList.map(
              async (filePath: string, index: number) => {
                try {
                  const entryMeta =
                    fileEntries?.[index] &&
                    typeof fileEntries[index] === 'object'
                      ? (fileEntries[index] as {
                          name?: string;
                          mimeType?: string;
                        })
                      : null;
                  const preferredName =
                    typeof entryMeta?.name === 'string'
                      ? entryMeta.name
                      : undefined;
                  const preferredMime =
                    typeof entryMeta?.mimeType === 'string'
                      ? entryMeta.mimeType
                      : undefined;

                  let blob: Blob;
                  let mimeType = preferredMime ?? 'application/octet-stream';
                  let extension = 'bin';

                  if (filePath.startsWith('data:')) {
                    // Handle data URL (Legacy)
                    const mimeMatch = filePath.match(/data:(.*?);/);
                    mimeType = mimeMatch ? mimeMatch[1] : mimeType;
                    extension = mimeType.split('/')[1] || extension;

                    const byteString = atob(filePath.split(',')[1]);
                    const ab = new ArrayBuffer(byteString.length);
                    const ia = new Uint8Array(ab);
                    for (let i = 0; i < byteString.length; i++) {
                      ia[i] = byteString.charCodeAt(i);
                    }
                    blob = new Blob([ab], { type: mimeType });
                  } else {
                    // Handle file path (New)
                    const { readFile } = await import('@tauri-apps/plugin-fs');
                    const bytes = await readFile(filePath);

                    const ext =
                      filePath.split('.').pop()?.toLowerCase() || 'bin';

                    // If mimeType not provided from metadata, guess from extension
                    if (mimeType === 'application/octet-stream') {
                      mimeType = (() => {
                        switch (ext) {
                          // Images
                          case 'jpg':
                          case 'jpeg':
                            return 'image/jpeg';
                          case 'png':
                            return 'image/png';
                          case 'webp':
                            return 'image/webp';
                          case 'gif':
                            return 'image/gif';
                          case 'svg':
                            return 'image/svg+xml';
                          // Documents
                          case 'pdf':
                            return 'application/pdf';
                          case 'txt':
                            return 'text/plain';
                          case 'md':
                            return 'text/markdown';
                          case 'csv':
                            return 'text/csv';
                          // Audio
                          case 'mp3':
                            return 'audio/mpeg';
                          case 'wav':
                            return 'audio/wav';
                          case 'ogg':
                            return 'audio/ogg';
                          // Video
                          case 'mp4':
                            return 'video/mp4';
                          case 'webm':
                            return 'video/webm';
                          case 'mov':
                            return 'video/quicktime';
                          default:
                            return 'application/octet-stream';
                        }
                      })();
                    }
                    extension = ext;
                    blob = new Blob([bytes], { type: mimeType });
                  }

                  return new File(
                    [blob],
                    preferredName ?? `file-${index}.${extension}`,
                    {
                      type: mimeType,
                    }
                  );
                } catch (e) {
                  logger.error('Failed to restore file', e);
                  return null;
                }
              }
            );

            Promise.all(promises).then((results) => {
              const validFiles = results.filter((f): f is File => f !== null);
              if (validFiles.length > 0) {
                dispatch(setAttachedFiles(validFiles));
              } else {
                dispatch(setAttachedFiles([]));
              }
            });
          } else {
            dispatch(setAttachedFiles([]));
          }
        } else {
          dispatch(setAttachedFiles([]));
        }
      } catch (e) {
        logger.error('Failed to restore images for editing', e);
        dispatch(setAttachedFiles([]));
      }
    }
  };

  const handleSend = async (
    overrideContent?: string,
    files?: string[],
    metadata?: string
  ) => {
    // If overrideContent is provided, use it. Otherwise read latest input from store.
    const contentToSend =
      overrideContent !== undefined
        ? overrideContent
        : store.getState().chatInput.input;

    const hasFiles = files && files.length > 0;
    const userInput = contentToSend.trim();

    if ((!userInput && !hasFiles && !metadata) || !selectedWorkspace) {
      return;
    }

    let currentChatId = selectedChatId;

    // Auto-create chat if none selected
    if (!currentChatId && selectedWorkspaceId) {
      try {
        const title =
          userInput.split('\n')[0].slice(0, 50) || t('newConversation');
        const newChat = await dispatch(
          createChat({
            workspaceId: selectedWorkspaceId,
            title,
          })
        ).unwrap();
        currentChatId = newChat.id;
      } catch (error) {
        logger.error('Failed to auto-create chat:', error);
        dispatch(showError(t('cannotCreateChat', { ns: 'settings' })));
        return;
      }
    }

    if (!currentChatId) {
      return;
    }

    // Check if editing an assistant message
    const editingMessage = editingMessageId
      ? messages.find((m) => m.id === editingMessageId)
      : null;
    const isEditingAssistant = editingMessage?.role === 'assistant';

    // Only validate length for user messages (new or editing)
    if (!isEditingAssistant && userInput.length > MAX_MESSAGE_LENGTH) {
      dispatch(
        showError(
          t('messageTooLong', {
            length: contentToSend.length,
            max: MAX_MESSAGE_LENGTH,
            ns: 'chat',
          })
        )
      );
      return;
    }

    const workspaceSetting = workspaceSettings[selectedWorkspace.id];
    let llmConnectionId = workspaceSetting?.llmConnectionId;
    let modelId = selectedModel;

    if (selectedModel?.includes('::')) {
      const [connId, ...modelIdParts] = selectedModel.split('::');
      llmConnectionId = connId;
      modelId = modelIdParts.join('::');
    }

    if (!llmConnectionId) {
      dispatch(showError(t('pleaseSelectLLMConnection', { ns: 'settings' })));
      return;
    }

    const llmConnection = llmConnections.find(
      (conn) => conn.id === llmConnectionId
    );
    if (!llmConnection) {
      dispatch(showError(t('llmConnectionNotFound', { ns: 'settings' })));
      return;
    }

    if (!modelId) {
      dispatch(showError(t('pleaseSelectModel', { ns: 'settings' })));
      return;
    }

    // Track message send
    const { trackMessageSend, setLLMContext, setChatContext } =
      await import('@/lib/sentry-utils');
    trackMessageSend(
      currentChatId,
      userInput.length,
      hasFiles || attachedFiles.length > 0
    );
    setLLMContext(llmConnection.provider, modelId);
    setChatContext(currentChatId);

    // Clear input immediately for better UX
    dispatch(clearInput());
    dispatch(setLoading(true));

    // Capture editing ID and clear it immediately for better UX
    const currentEditingId = editingMessageId;
    if (currentEditingId) {
      setEditingMessageId(null);
    }

    try {
      // Send message with streaming support (streaming handled via Tauri events)
      if (currentEditingId) {
        const message = messages.find((m) => m.id === currentEditingId);
        if (message) {
          if (message.role === 'user') {
            await dispatch(
              editAndResendMessage({
                chatId: currentChatId,
                messageId: currentEditingId,
                newContent: userInput,
                files, // Pass updated files
                metadata, // Pass updated metadata (includes flow)
              })
            ).unwrap();
          } else if (message.role === 'assistant') {
            await invokeCommand(TauriCommands.UPDATE_MESSAGE, {
              id: currentEditingId,
              content: userInput,
              reasoning: message.reasoning || null,
              timestamp: null,
            });
            dispatch(
              messagesApi.util.invalidateTags([
                { type: 'Message', id: `LIST_${currentChatId}` },
              ])
            );
          }
        }
      } else {
        await dispatch(
          sendMessage({
            chatId: currentChatId,
            content: userInput,
            files,
            metadata,
          })
        ).unwrap();

        // Chat title generation is now handled automatically by backend in send_message
      }

      // Note: Chat last message is updated by Rust core after message completion
      // Events will handle content updates, so we don't need to update it here
    } catch (error: unknown) {
      logger.error('Error sending message:', error);
      // Error message is already handled in the thunk
      // Note: Input is already cleared, which is fine for UX
    } finally {
      dispatch(setLoading(false));
    }
  };

  const handleAskUserSubmit = async (
    toolCallId: string,
    answers: Parameters<typeof respondUserQuestion>[1]
  ) => {
    setIsSubmittingAskUser(true);
    try {
      await respondUserQuestion(toolCallId, answers);
    } catch {
      dispatch(showError(t('askUser.submitError', { ns: 'chat' })));
    } finally {
      setIsSubmittingAskUser(false);
    }
  };

  const chatInputDisabled = hasPendingAskUser || isSubmittingAskUser;

  if (messages.length === 0) {
    // Empty state: Show slogan and center the input
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="flex flex-col items-center justify-center mb-8">
          <div className="rounded-full bg-primary/10 p-4 mb-4">
            <Sparkles className="size-8 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            {t('chatSlogan', { ns: 'common' })}
          </h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            {t('chatSloganDescription', { ns: 'common' })}
          </p>
        </div>
        <div className={cn('w-full', CHAT_WIDTH_CLASSES)}>
          {pendingRequestForChat && (
            <AskUserPanel
              request={pendingRequestForChat}
              onSubmit={handleAskUserSubmit}
              isSubmitting={isSubmittingAskUser}
            />
          )}
          <ChatInput
            selectedWorkspaceId={selectedWorkspaceId}
            selectedChatId={selectedChatId}
            selectedLLMConnectionId={selectedLLMConnectionId}
            onSend={handleSend}
            disabled={chatInputDisabled}
            isEditing={!!editingMessageId}
            onCancelEdit={() => handleEditMessage(null)}
          />
        </div>
      </div>
    );
  }

  // Has messages: Normal layout
  return (
    <>
      {/* Messages Area */}
      <ChatMessages
        chatId={selectedChatId}
        messages={messages}
        streamingMessageId={streamingMessageId}
        onCancelToolExecution={handleStopStreaming}
        onEditMessage={handleEditMessage}
      />

      {pendingRequestForChat && (
        <AskUserPanel
          request={pendingRequestForChat}
          onSubmit={handleAskUserSubmit}
          isSubmitting={isSubmittingAskUser}
        />
      )}

      {/* Input Area */}
      <ChatInput
        selectedWorkspaceId={selectedWorkspaceId}
        selectedChatId={selectedChatId}
        selectedLLMConnectionId={selectedLLMConnectionId}
        onSend={handleSend}
        disabled={chatInputDisabled}
        dropdownDirection="up"
        isEditing={!!editingMessageId}
        onCancelEdit={() => handleEditMessage(null)}
      />

      <ImagePreviewDialog />
    </>
  );
}
