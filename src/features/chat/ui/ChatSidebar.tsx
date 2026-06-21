import { useState } from 'react';
import {
  Plus,
  Trash2,
  Pencil,
  Settings,
  SlidersHorizontal,
  Download,
  Search,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { invokeCommand, TauriCommands } from '@/lib/tauri';
import { Button } from '@/ui/atoms/button/button';
import { Input } from '@/ui/atoms/input';
import { ScrollArea } from '@/ui/atoms/scroll-area';
import { Separator } from '@/ui/atoms/separator';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/ui/atoms/dialog/component';
import { ContextMenu } from '@/ui/atoms/context-menu';
import { cn } from '@/lib/utils';
import type { Message } from '@/app/types';
import { useChats } from '../hooks/useChats';
import { useWorkspaces } from '@/features/workspace';
import { WorkspaceSelector } from '@/features/workspace/ui/WorkspaceSelector';
import { useExportChat } from '@/features/chat/hooks/useExportChat';
import { useAppDispatch } from '@/app/hooks';
import {
  setWorkspaceSettingsOpen,
  navigateToSettings,
} from '@/features/ui/state/uiSlice';
import { setSearchOpen } from '../state/chatSearchSlice';
import { logger } from '@/lib/logger';
import { isActiveConversationPhase } from '../state/conversationRuntimeSlice';
import { ConfirmDialog } from '@/ui/molecules/ConfirmDialog';
import { SidebarUpdateButton } from '@/features/updater/ui/SidebarUpdateButton';

const sidebarActionClass =
  'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-sidebar-foreground';

export function ChatSidebar() {
  // Use workspaces hook to get selectedWorkspaceId
  const { selectedWorkspaceId } = useWorkspaces();

  // Use chats hook
  const {
    chats,
    selectedChatId,
    conversationRuntime,
    handleNewChat,
    handleChatSelect,
    handleDeleteChat,
    handleRenameChat,
  } = useChats(selectedWorkspaceId);
  const { handleExportMarkdown } = useExportChat();
  const { t } = useTranslation(['common', 'chat', 'settings']);
  const dispatch = useAppDispatch();
  const [contextMenu, setContextMenu] = useState<{
    chatId: string;
    x: number;
    y: number;
  } | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [chatToRename, setChatToRename] = useState<{
    id: string;
    currentTitle: string;
  } | null>(null);
  const [newChatTitle, setNewChatTitle] = useState('');
  const [isDeletingChat, setIsDeletingChat] = useState(false);

  const handleRenameClick = (chatId: string) => {
    const chat = chats.find((c) => c.id === chatId);
    if (chat) {
      setChatToRename({ id: chatId, currentTitle: chat.title });
      setNewChatTitle(chat.title);
      setRenameDialogOpen(true);
    }
  };

  const handleSaveRename = async () => {
    if (!chatToRename || !newChatTitle.trim()) return;

    try {
      await handleRenameChat(chatToRename.id, newChatTitle.trim());
      setRenameDialogOpen(false);
      setChatToRename(null);
      setNewChatTitle('');
    } catch (error) {
      logger.error('Error renaming chat:', error);
    }
  };

  const handleDeleteClick = (chatId: string) => {
    setChatToDelete(chatId);
    setDeleteDialogOpen(true);
  };

  const handleContextMenu = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      chatId,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleConfirmDelete = async () => {
    if (!chatToDelete) return;

    try {
      setIsDeletingChat(true);
      await handleDeleteChat(chatToDelete);
      setDeleteDialogOpen(false);
      setChatToDelete(null);
    } catch (error) {
      logger.error('Error deleting chat:', error);
    } finally {
      setIsDeletingChat(false);
    }
  };

  const handleExport = async (chatId: string) => {
    try {
      const messages = await invokeCommand<Message[]>(
        TauriCommands.GET_MESSAGES,
        {
          chatId,
        }
      );

      handleExportMarkdown(chatId, messages);
    } catch (error) {
      logger.error('Failed to export chat from sidebar:', error);
    }
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-sidebar pr-2 select-none">
      <div className="shrink-0 px-3 pt-1.5 pb-2">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            className={sidebarActionClass}
            onClick={handleNewChat}
          >
            <Plus className="size-3.5 shrink-0" />
            <span>{t('common:newConversation')}</span>
          </button>
          <button
            type="button"
            className={sidebarActionClass}
            onClick={() => dispatch(setSearchOpen(true))}
          >
            <Search className="size-3.5 shrink-0" />
            <span>{t('common:searchChats')}</span>
          </button>
          <button
            type="button"
            className={sidebarActionClass}
            onClick={() => dispatch(navigateToSettings())}
          >
            <SlidersHorizontal className="size-3.5 shrink-0" />
            <span>{t('common:settings')}</span>
          </button>
          <button
            type="button"
            className={sidebarActionClass}
            onClick={() => dispatch(setWorkspaceSettingsOpen(true))}
          >
            <Settings className="size-3.5 shrink-0" />
            <span>{t('settings:workspaceSettings')}</span>
          </button>
        </div>
      </div>

      <Separator className="bg-sidebar-border" />

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-3 pb-2 pt-2">
          {chats.filter((chat) => !chat.parentId).length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              <p>{t('common:noConversations')}</p>
            </div>
          ) : (
            <>
              <p className="mb-1.5 px-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                {t('common:recents')}
              </p>
              <div className="flex flex-col gap-0.5">
                {chats
                  .filter((chat) => !chat.parentId)
                  .map((chat) => (
                    <div
                      key={chat.id}
                      className={cn(
                        'relative min-w-0 cursor-pointer overflow-hidden rounded-md px-3 py-1.5',
                        selectedChatId === chat.id
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground'
                      )}
                      onClick={() => {
                        setContextMenu(null);
                        handleChatSelect(chat.id);
                      }}
                      onContextMenu={(e) => handleContextMenu(e, chat.id)}
                    >
                      <span
                        title={chat.title}
                        className={cn(
                          'block min-w-0 truncate text-[13px] leading-tight',
                          selectedChatId === chat.id
                            ? 'text-foreground'
                            : 'text-sidebar-foreground'
                        )}
                      >
                        {chat.title}
                      </span>

                      {(() => {
                        const runtime = conversationRuntime[chat.id];
                        const isActive =
                          runtime &&
                          isActiveConversationPhase(runtime.phase.kind);
                        if (!isActive) return null;
                        const queueDepth = runtime.queue_depth;
                        return (
                          <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden rounded-b-md">
                            <div className="h-full w-full bg-primary/10">
                              <div className="h-full bg-primary animate-indeterminate-bar" />
                            </div>
                            {queueDepth > 0 && (
                              <span className="absolute -top-3 right-1 rounded bg-primary px-1 text-[10px] text-primary-foreground">
                                +{queueDepth}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      <div className="mt-auto shrink-0 space-y-2 border-t border-sidebar-border px-3 py-2">
        <SidebarUpdateButton />
        <WorkspaceSelector compact />
      </div>

      {/* Context Menu */}
      <ContextMenu
        open={contextMenu !== null}
        position={
          contextMenu ? { x: contextMenu.x, y: contextMenu.y } : { x: 0, y: 0 }
        }
        items={
          contextMenu
            ? [
                {
                  label: t('common:rename'),
                  icon: <Pencil className="size-4" />,
                  onClick: () => handleRenameClick(contextMenu.chatId),
                  variant: 'default',
                },
                {
                  label: t('chat:exportChat'),
                  icon: <Download className="size-4" />,
                  onClick: () => handleExport(contextMenu.chatId),
                  variant: 'default',
                },
                {
                  label: t('common:delete'),
                  icon: <Trash2 className="size-4" />,
                  onClick: () => handleDeleteClick(contextMenu.chatId),
                  variant: 'destructive',
                },
              ]
            : []
        }
        onClose={() => setContextMenu(null)}
      />

      {/* Rename Chat Dialog */}
      <Dialog
        open={renameDialogOpen}
        onOpenChange={(open) => {
          setRenameDialogOpen(open);
          if (!open) {
            setChatToRename(null);
            setNewChatTitle('');
          }
        }}
      >
        <DialogContent className="items-stretch gap-0 p-4 sm:max-w-xs">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveRename();
            }}
            className="flex flex-col gap-3"
          >
            <DialogTitle className="m-0 text-sm font-medium leading-none">
              {t('common:renameConversation')}
            </DialogTitle>
            <Input
              id="chat-name"
              value={newChatTitle}
              onChange={(e) => setNewChatTitle(e.target.value)}
              placeholder={t('common:enterNewName')}
              className="h-8"
              autoFocus
              aria-label={t('common:enterNewName')}
            />
            <div className="flex justify-end gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => {
                  setRenameDialogOpen(false);
                  setChatToRename(null);
                  setNewChatTitle('');
                }}
              >
                {t('common:cancel')}
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-7 px-3"
                disabled={!newChatTitle.trim()}
              >
                {t('common:save')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Chat Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setChatToDelete(null);
        }}
        title={t('settings:deleteChat')}
        description={t('settings:confirmDeleteChat', {
          title: chats.find((c) => c.id === chatToDelete)?.title ?? '',
        })}
        onConfirm={handleConfirmDelete}
        confirmLabel={t('common:delete')}
        isLoading={isDeletingChat}
        compact
      />
    </div>
  );
}
