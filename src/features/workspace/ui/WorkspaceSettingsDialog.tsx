import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '@/ui/atoms/scroll-area';
import {
  SettingsDialog,
  SettingsList,
  SettingsSection,
  SettingLinkItem,
  SettingToggleItem,
  SettingActionItem,
  SettingValueItem,
  SettingSelectItem,
  SettingCheckItem,
  SettingInputItem,
  useSettingsNav,
} from '@/ui/settings';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/ui/atoms/select';
import {
  Building2,
  Cpu,
  Wrench,
  Lightbulb,
  Settings2,
  Trash2,
  Eraser,
  MessageSquare,
} from 'lucide-react';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { messagesApi } from '@/features/chat/state/messagesApi';
import { invokeCommand, TauriCommands } from '@/lib/tauri';
import {
  clearAllChats,
  createChat,
  setSelectedChat,
} from '@/features/chat/state/chatsSlice';
import {
  showError,
  showSuccess,
} from '@/features/notifications/state/notificationSlice';
import {
  navigateToSettings,
  setSettingsSection,
} from '@/features/ui/state/uiSlice';
import { logger } from '@/lib/logger';
import { useGetLLMConnectionsQuery } from '@/features/llm';
import { useGetMCPConnectionsQuery } from '@/features/mcp';
import { useGetAllSkillsQuery } from '@/features/skill/state/skillsApi';
import { MCPSettings } from './settings/MCPSettings';
import { ConfirmDialog } from '@/ui/molecules/ConfirmDialog';
import type { WorkspaceSettings } from '../types';

interface WorkspaceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkspaceSettingsDialog({
  open,
  onOpenChange,
}: WorkspaceSettingsDialogProps) {
  const { t } = useTranslation(['settings', 'common']);
  const dispatch = useAppDispatch();
  const {
    selectedWorkspace,
    workspaceSettings,
    handleSaveWorkspaceSettings,
    handleDeleteWorkspace,
  } = useWorkspaces();

  const settings = selectedWorkspace
    ? workspaceSettings[selectedWorkspace.id]
    : null;
  const { data: llmConnections = [] } = useGetLLMConnectionsQuery();
  const { data: allMcpConnections = [] } = useGetMCPConnectionsQuery();
  const { data: allSkills = [] } = useGetAllSkillsQuery();

  const { currentView, push, pop, canGoBack } = useSettingsNav({
    id: 'root',
    title: t('workspaceSettings', { ns: 'settings' }),
  });

  const chats = useAppSelector((state) =>
    selectedWorkspace
      ? state.chats.chatsByWorkspaceId[selectedWorkspace.id] || []
      : []
  );

  const [clearChatsConfirmOpen, setClearChatsConfirmOpen] = useState(false);
  const [deleteWorkspaceConfirmOpen, setDeleteWorkspaceConfirmOpen] =
    useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Auto-save logic
  const saveSettings = async (updates: Partial<WorkspaceSettings>) => {
    if (!selectedWorkspace || !settings) return;
    try {
      await handleSaveWorkspaceSettings({
        ...settings,
        ...updates,
        id: selectedWorkspace.id,
      });
    } catch (_error) {
      logger.error('Auto-save failed:', _error);
    }
  };

  const handleClearAllChats = async () => {
    if (!selectedWorkspace) return;
    try {
      setIsClearing(true);
      const chatIds = chats.map((chat) => chat.id);
      chatIds.forEach((chatId) => {
        invokeCommand(TauriCommands.CANCEL_MESSAGE, { chatId }).catch(() => {});
        dispatch(
          messagesApi.util.invalidateTags([
            { type: 'Message', id: `LIST_${chatId}` },
          ])
        );
      });
      await dispatch(clearAllChats(selectedWorkspace.id)).unwrap();
      const newChat = await dispatch(
        createChat({
          workspaceId: selectedWorkspace.id,
          title: t('common:newConversation'),
        })
      ).unwrap();
      dispatch(setSelectedChat(newChat.id));
      dispatch(
        showSuccess(t('allChatsCleared'), t('allChatsClearedDescription'))
      );
      setClearChatsConfirmOpen(false);
    } catch (_error) {
      dispatch(showError(t('cannotClearAllChats')));
    } finally {
      setIsClearing(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedWorkspace) return;
    try {
      setIsDeleting(true);
      await handleDeleteWorkspace(selectedWorkspace.id);
      onOpenChange(false);
    } catch (_error) {
      // Error handled by hook
    } finally {
      setIsDeleting(false);
    }
  };

  if (!selectedWorkspace || !settings) return null;

  return (
    <SettingsDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('workspaceSettings', { ns: 'settings' })}
      activeViewTitle={
        currentView.id === 'root' ? undefined : currentView.title
      }
      onBack={canGoBack ? pop : undefined}
    >
      <div className="h-full overflow-y-auto">
        {currentView.id === 'root' && (
          <SettingsList>
            <SettingsSection title={t('general', { ns: 'settings' })}>
              <SettingValueItem
                icon={<Building2 className="h-4 w-4" />}
                label={t('workspaceName', { ns: 'settings' })}
                value={selectedWorkspace.name}
              />
              <SettingLinkItem
                icon={<MessageSquare className="h-4 w-4" />}
                label={t('systemMessage', { ns: 'settings' })}
                onClick={() =>
                  push({
                    id: 'system_message',
                    title: t('systemMessage', { ns: 'settings' }),
                  })
                }
              />
            </SettingsSection>

            <SettingsSection title={t('capabilities', { ns: 'settings' })}>
              <SettingSelectItem
                icon={<Cpu className="h-4 w-4" />}
                label={t('model', { ns: 'settings' })}
              >
                <Select
                  value={
                    settings.defaultModel && settings.llmConnectionId
                      ? `${settings.llmConnectionId}:${settings.defaultModel}`
                      : ''
                  }
                  onValueChange={(value) => {
                    const [connId, modelId] = value.split(':');
                    saveSettings({
                      llmConnectionId: connId,
                      defaultModel: modelId,
                    });
                  }}
                >
                  <SelectTrigger
                    variant="ghost"
                    className="text-xs min-w-[120px]"
                  >
                    <SelectValue
                      placeholder={t('selectModel', { ns: 'settings' })}
                    />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {llmConnections.map((conn) => (
                      <SelectGroup key={conn.id}>
                        <SelectLabel>{conn.name}</SelectLabel>
                        {conn.models?.map((model) => (
                          <SelectItem
                            key={`${conn.id}:${model.id}`}
                            value={`${conn.id}:${model.id}`}
                          >
                            {model.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </SettingSelectItem>
              <SettingLinkItem
                icon={<Wrench className="h-4 w-4" />}
                label={t('mcpTools', { ns: 'settings' })}
                value={Object.keys(settings.mcpToolIds || {}).length.toString()}
                onClick={() =>
                  push({ id: 'mcp', title: t('mcpTools', { ns: 'settings' }) })
                }
              />
              <SettingLinkItem
                icon={<Lightbulb className="h-4 w-4" />}
                label={t('skills', { ns: 'settings' })}
                value={settings.selectedSkillIds?.length.toString() || '0'}
                onClick={() =>
                  push({ id: 'skills', title: t('skills', { ns: 'settings' }) })
                }
              />
            </SettingsSection>

            <SettingsSection title={t('advanced', { ns: 'settings' })}>
              <SettingToggleItem
                icon={<Settings2 className="h-4 w-4" />}
                label={t('streamEnabled', { ns: 'settings' })}
                checked={settings.streamEnabled !== false}
                onCheckedChange={(checked) =>
                  saveSettings({ streamEnabled: checked })
                }
              />
              <SettingInputItem
                icon={<Cpu className="h-4 w-4" />}
                label={t('maxIterations', { ns: 'common' })}
                type="number"
                value={settings.maxAgentIterations ?? 25}
                min={1}
                max={100}
                onChange={(value: string) =>
                  saveSettings({ maxAgentIterations: parseInt(value) || 1 })
                }
              />
            </SettingsSection>

            <SettingsSection title={t('dangerZone', { ns: 'settings' })}>
              <SettingActionItem
                icon={<Eraser className="h-4 w-4" />}
                label={t('clearAllChats', { ns: 'settings' })}
                onClick={() => setClearChatsConfirmOpen(true)}
              />
              <SettingActionItem
                icon={<Trash2 className="h-4 w-4" />}
                label={t('deleteWorkspace', { ns: 'settings' })}
                variant="destructive"
                onClick={() => setDeleteWorkspaceConfirmOpen(true)}
              />
            </SettingsSection>
          </SettingsList>
        )}

        {currentView.id === 'system_message' && (
          <div className="p-4 h-full flex flex-col gap-3">
            <p className="text-xs text-muted-foreground leading-relaxed px-1">
              {t('systemMessageDescription', { ns: 'settings' })}
            </p>
            <textarea
              className="flex-1 w-full bg-background border border-border/60 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none shadow-sm transition-shadow"
              defaultValue={settings.systemMessage}
              onBlur={(e) => saveSettings({ systemMessage: e.target.value })}
              placeholder={t('systemMessagePlaceholder', { ns: 'settings' })}
            />
          </div>
        )}

        {currentView.id === 'mcp' && (
          <div className="h-full">
            <ScrollArea className="h-full">
              <div className="p-4">
                <MCPSettings
                  allMcpConnections={allMcpConnections}
                  selectedTools={settings.mcpToolIds || {}}
                  onSelectedToolsChange={(updater) => {
                    const newTools = updater(settings.mcpToolIds || {});
                    saveSettings({ mcpToolIds: newTools });
                  }}
                  toolPermissionConfig={settings.toolPermissionConfig || {}}
                  onToolPermissionConfigChange={(updater) => {
                    const newConfig = updater(
                      settings.toolPermissionConfig || {}
                    );
                    saveSettings({ toolPermissionConfig: newConfig });
                  }}
                  onManageConnections={() => {
                    onOpenChange(false);
                    dispatch(navigateToSettings());
                    dispatch(setSettingsSection('mcp'));
                  }}
                />
              </div>
            </ScrollArea>
          </div>
        )}

        {currentView.id === 'skills' && (
          <div className="h-full">
            <ScrollArea className="h-full">
              <SettingsList>
                <SettingsSection>
                  {allSkills.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground italic">
                      {t('noSkillsAvailable', { ns: 'settings' })}
                    </div>
                  ) : (
                    allSkills.map((skill) => {
                      const isSelected = (
                        settings.selectedSkillIds || []
                      ).includes(skill.id);
                      return (
                        <SettingCheckItem
                          key={skill.id}
                          label={skill.name}
                          value={skill.description}
                          checked={isSelected}
                          onClick={() => {
                            const currentIds = settings.selectedSkillIds || [];
                            const newIds = isSelected
                              ? currentIds.filter((id) => id !== skill.id)
                              : [...currentIds, skill.id];
                            saveSettings({ selectedSkillIds: newIds });
                          }}
                        />
                      );
                    })
                  )}
                </SettingsSection>
              </SettingsList>
            </ScrollArea>
          </div>
        )}

        {/* Placeholder for other views - can be implemented as needed */}
        {['advanced'].includes(currentView.id) && (
          <div className="p-4">
            <SettingsSection title={t('advancedOptions', { ns: 'settings' })}>
              <SettingToggleItem
                label={t('streamEnabled', { ns: 'settings' })}
                checked={settings.streamEnabled !== false}
                onCheckedChange={(checked) =>
                  saveSettings({ streamEnabled: checked })
                }
              />
              <SettingInputItem
                label={t('maxIterations', { ns: 'common' })}
                type="number"
                value={settings.maxAgentIterations ?? 25}
                min={1}
                max={100}
                onChange={(value: string) =>
                  saveSettings({ maxAgentIterations: parseInt(value) || 1 })
                }
              />
            </SettingsSection>
          </div>
        )}

        <ConfirmDialog
          open={clearChatsConfirmOpen}
          onOpenChange={setClearChatsConfirmOpen}
          title={t('clearAllChats', { ns: 'settings' })}
          description={t('confirmClearAllChats', { ns: 'settings' })}
          onConfirm={handleClearAllChats}
          confirmLabel={t('clear', { ns: 'common' })}
          isLoading={isClearing}
          compact
        />

        <ConfirmDialog
          open={deleteWorkspaceConfirmOpen}
          onOpenChange={setDeleteWorkspaceConfirmOpen}
          title={t('deleteWorkspace', { ns: 'settings' })}
          description={t('confirmDeleteWorkspace', { ns: 'settings' })}
          onConfirm={handleDelete}
          confirmLabel={t('delete', { ns: 'common' })}
          isLoading={isDeleting}
          compact
        />
      </div>
    </SettingsDialog>
  );
}
