import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  Send,
  Paperclip,
  Square,
  Wrench,
  Brain,
  Search,
  X,
  Workflow,
} from 'lucide-react';
import { Input } from '@/ui/atoms/input';
import { MAX_MESSAGE_LENGTH, MAX_FILE_SIZE } from '@/lib/constants';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/atoms/button/button';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/ui/atoms/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/ui/atoms/dropdown-menu';
import { useGetLLMConnectionsQuery } from '@/features/llm';
import { useGetActiveToolsForWorkspaceQuery } from '@/features/tools/state/toolsApi';
import { useWorkspaces } from '@/features/workspace';
import { useAppDispatch } from '@/app/hooks';
import type { LLMConnection } from '@/features/llm/types';
import { cn, formatFileSize } from '@/lib/utils';
import { showError } from '@/features/notifications/state/notificationSlice';
import {
  canAttachFiles,
  getFileAcceptForCapabilities,
  isFileAllowedForCapabilities,
  resolveModelCapabilities,
} from '@/features/llm/lib/model-utils';
import { useChatInput } from '../../hooks/useChatInput';
import { useMessages } from '../../hooks/useMessages';
import { useSlashCommand } from '@/hooks/useSlashCommand';
import { skillRecordToInserted } from '@/features/chat/lib/skillAttachment';
import type { InsertedSkill } from '@/features/chat/lib/skillAttachment';
import { useComponentPerformance } from '@/hooks/useComponentPerformance';
import { SlashCommandDropdown } from '@/ui/molecules/SlashCommandDropdown';
import { FLOW_NODES, FlowEditorDialog } from '@/ui/molecules/flow';

import { useAppSettings } from '@/hooks/useAppSettings';
import { setWorkspaceSettingsOpen } from '@/features/ui/state/uiSlice';
import { useChatSubmit } from '../../hooks/useChatSubmit';
import { useChatDragDrop } from '../../hooks/useChatDragDrop';
import { ChatAttachments } from './components/ChatAttachments';
import { ChatDragOverlay } from './components/ChatDragOverlay';
import { useTextareaAutoResize } from '../../hooks/useTextareaAutoResize';
import { CHAT_WIDTH_CLASSES } from '../ChatLayout';
import { aggregateConversationTokenUsage } from '../../lib/tokenUsage';

interface ChatInputProps {
  selectedWorkspaceId: string | null;
  selectedChatId: string | null;
  selectedLLMConnectionId?: string;
  onSend: (content?: string, images?: string[], metadata?: string) => void;
  disabled?: boolean;
  dropdownDirection?: 'up' | 'down';
  isEditing?: boolean;
  onCancelEdit?: () => void;
}

export function ChatInput({
  selectedWorkspaceId,
  selectedChatId,
  selectedLLMConnectionId,
  onSend,
  disabled = false,
  dropdownDirection = 'down',
  isEditing = false,
  onCancelEdit,
}: ChatInputProps) {
  // Track render performance
  useComponentPerformance({
    componentName: 'ChatInput',
    threshold: 50,
  });
  const { t } = useTranslation(['chat', 'common', 'settings']);
  const dispatch = useAppDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const { data: llmConnections = [] } = useGetLLMConnectionsQuery();
  const { selectedWorkspace, workspaceSettings: allWorkspaceSettings } =
    useWorkspaces();
  const workspaceSettings = selectedWorkspace
    ? allWorkspaceSettings[selectedWorkspace.id]
    : undefined;
  const workspaceSelectedSkillIds = workspaceSettings?.selectedSkillIds ?? [];

  const [flowDialogOpen, setFlowDialogOpen] = useState(false);

  // State for inserted skill (shown as chip above textarea)
  const [insertedSkill, setInsertedSkill] = useState<InsertedSkill | null>(
    null
  );

  // Use chat input hook
  const {
    input,
    selectedModel,
    attachedFiles,
    attachedFlow,
    handleInputChange,
    handleModelChange,
    handleFileUpload,
    setFlow,
    isThinkingEnabled,
    reasoningEffort,
    handleThinkingToggle,
    handleReasoningEffortChange,
  } = useChatInput(selectedWorkspaceId);

  // Get app settings for experimental features
  const { enableWorkflowEditor } = useAppSettings();

  // Calculate active tools from workspace settings - fetching from backend for unified source of truth
  const { data: activeTools = [] } = useGetActiveToolsForWorkspaceQuery(
    selectedWorkspaceId || '',
    { skip: !selectedWorkspaceId }
  );

  // Use messages hook for streaming state
  const { handleStopStreaming, isStreaming, messages } =
    useMessages(selectedChatId);

  const conversationTokenUsage = useMemo(
    () => aggregateConversationTokenUsage(messages),
    [messages]
  );

  const effectiveIsStreaming = isStreaming;

  const slashCloseRef = useRef<() => void>(() => {});

  const slashCommand = useSlashCommand({
    input,
    workspaceSelectedSkillIds,
    onSelectSkill: (skill) => {
      slashCloseRef.current();
      setTimeout(() => {
        setInsertedSkill(skillRecordToInserted(skill));
        handleInputChange('');
        textareaRef.current?.focus();
      }, 0);
    },
  });

  useEffect(() => {
    slashCloseRef.current = slashCommand.close;
  }, [slashCommand.close]);

  const handleRemoveSkill = useCallback(() => {
    setInsertedSkill(null);
  }, []);

  const handleRemoveFlow = useCallback(() => {
    setFlow(null);
  }, [setFlow]);

  const handleOpenFlowDialog = useCallback(() => {
    setFlowDialogOpen(true);
  }, []);

  const { handleSubmit } = useChatSubmit({
    onSend,
    attachedFiles,
    attachedFlow,
    setInsertedSkill,
    setFlow,
    handleFileUpload,
    input,
    insertedSkill,
  });

  // Find current connection and model name
  const { currentConnection, currentModelName, currentModel } = useMemo(() => {
    if (!selectedModel) {
      const conn = selectedLLMConnectionId
        ? llmConnections.find((conn) => conn.id === selectedLLMConnectionId)
        : null;
      return {
        currentConnection: conn,
        currentModelName: null,
        currentModel: null,
      };
    }

    let connId = selectedLLMConnectionId;
    let modelId = selectedModel;

    if (selectedModel.includes('::')) {
      const [parsedConnId, ...modelIdParts] = selectedModel.split('::');
      connId = parsedConnId;
      modelId = modelIdParts.join('::');
    }

    const conn = llmConnections.find((c) => c.id === connId);
    const model = conn?.models?.find((m) => m.id === modelId);

    return {
      currentConnection: conn,
      currentModelName: model?.name || modelId,
      currentModel: model,
    };
  }, [selectedModel, selectedLLMConnectionId, llmConnections]);

  const modelCapabilities = useMemo(
    () => resolveModelCapabilities(currentModel ?? undefined, currentModelName),
    [currentModel, currentModelName]
  );

  const supportsFileUpload = canAttachFiles(modelCapabilities);
  const fileAccept = useMemo(
    () => getFileAcceptForCapabilities(modelCapabilities),
    [modelCapabilities]
  );
  const supportsToolCalling = modelCapabilities.tools;
  const supportsThinking = modelCapabilities.thinking;

  const [modelSearchTerm, setModelSearchTerm] = useState('');

  const filteredLLMConnections = useMemo(() => {
    // First filter to only enabled connections
    const enabledConnections = llmConnections.filter((conn) => conn.enabled);

    if (!modelSearchTerm) return enabledConnections;

    return enabledConnections
      .map((conn: LLMConnection) => ({
        ...conn,
        models: [...(conn.models || [])]
          .sort((a, b) => a.id.localeCompare(b.id))
          .filter(
            (m) =>
              m.name?.toLowerCase().includes(modelSearchTerm.toLowerCase()) ||
              m.id.toLowerCase().includes(modelSearchTerm.toLowerCase())
          ),
      }))
      .filter((conn) => conn.models && conn.models.length > 0);
  }, [llmConnections, modelSearchTerm]);

  // Use custom hook for textarea resize
  const { textareaRef } = useTextareaAutoResize({ val: input });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashCommand.isActive) {
      const handled = slashCommand.handleKeyDown(e);
      if (handled) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        slashCommand.close();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      if (slashCommand.isActive && slashCommand.filteredSkills.length > 0) {
        return;
      }
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const validFiles: File[] = [];

      for (const file of files) {
        // Validate size
        if (file.size > MAX_FILE_SIZE) {
          dispatch(
            showError(
              t('fileTooLarge', {
                size: formatFileSize(file.size),
                max: formatFileSize(MAX_FILE_SIZE),
                ns: 'chat',
              })
            )
          );
          continue;
        }

        // Validate type against model input capabilities
        if (!isFileAllowedForCapabilities(file, modelCapabilities)) {
          dispatch(
            showError(
              t('fileTypeNotSupported', { type: file.type, ns: 'chat' })
            )
          );
          continue;
        }

        validFiles.push(file);
      }

      if (validFiles.length > 0) {
        const newFiles = [...attachedFiles, ...validFiles];
        handleFileUpload(newFiles);
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = useCallback(
    (index: number) => {
      const newFiles = attachedFiles.filter((_, i) => i !== index);
      handleFileUpload(newFiles);
    },
    [attachedFiles, handleFileUpload]
  );

  const handleUploadClick = () => {
    if (supportsFileUpload) {
      fileInputRef.current?.click();
    }
  };

  useEffect(() => {
    if (!supportsFileUpload && attachedFiles.length > 0) {
      handleFileUpload([]);
    }
  }, [attachedFiles.length, handleFileUpload, supportsFileUpload]);

  // Use Drag & Drop hook
  const {
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDisplayPaste,
  } = useChatDragDrop({
    attachedFiles,
    handleFileUpload,
    modelCapabilities,
  });

  return (
    <>
      <div className="bg-background">
        <div className={cn(CHAT_WIDTH_CLASSES, 'py-2')}>
          {conversationTokenUsage && (
            <div className="mb-1.5 flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground select-text">
              {conversationTokenUsage.promptTokens !== undefined && (
                <span>
                  {t('promptTokens')}:{' '}
                  {conversationTokenUsage.promptTokens.toLocaleString()}
                </span>
              )}
              {conversationTokenUsage.completionTokens !== undefined && (
                <span>
                  {t('completionTokens')}:{' '}
                  {conversationTokenUsage.completionTokens.toLocaleString()}
                </span>
              )}
              {conversationTokenUsage.totalTokens !== undefined && (
                <span>
                  {t('totalTokens')}:{' '}
                  {conversationTokenUsage.totalTokens.toLocaleString()}
                </span>
              )}
            </div>
          )}

          {/* Edit Mode Bar - Above ChatInput */}
          {isEditing && (
            <div className="flex items-center justify-between rounded-t-lg bg-primary/10 px-3 py-1 border-x border-t border-primary/20">
              <span className="text-xs font-medium text-primary">
                {t('editingMessage', { ns: 'common' })}
              </span>
              {onCancelEdit && (
                <button
                  onClick={onCancelEdit}
                  className="rounded-full hover:bg-primary/20 transition-colors p-1"
                  aria-label={t('cancel', { ns: 'common' })}
                >
                  <X className="h-3.5 w-3.5 text-primary" />
                </button>
              )}
            </div>
          )}

          <div
            className={cn(
              'border border-border bg-muted/20 shadow-sm p-2 relative transition-[background-color,border-color]',
              isEditing ? 'rounded-b-lg border-t-0' : 'rounded-lg',
              isDragging && 'border-primary ring-2 ring-primary/20 bg-muted/50'
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Drag Indicator Overlay */}
            {isDragging && <ChatDragOverlay />}

            {/* Attachments & Prompts & Agents Area */}
            <ChatAttachments
              attachedFiles={attachedFiles}
              attachedFlow={attachedFlow}
              insertedSkill={insertedSkill}
              onRemoveFile={handleRemoveFile}
              onRemoveFlow={handleRemoveFlow}
              onOpenFlowDialog={handleOpenFlowDialog}
              onRemoveSkill={handleRemoveSkill}
              disabled={disabled}
            />

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={fileAccept}
              className="hidden"
              onChange={handleFileSelect}
              disabled={disabled || !supportsFileUpload}
            />

            {/* Row 1: Text Input Only */}
            <div className="mb-0 relative" ref={inputContainerRef}>
              <textarea
                ref={textareaRef}
                data-slot="textarea"
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handleDisplayPaste}
                placeholder={t('enterMessage')}
                disabled={disabled}
                className={cn(
                  'border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 transition-[color,box-shadow,background-color,border-color] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
                  'w-full min-h-[40px] max-h-[200px] resize-none leading-relaxed text-sm py-0 px-2 border-0 rounded-lg outline-none flex content-center ring-0 shadow-none focus:ring-0 focus:shadow-none bg-transparent dark:bg-transparent'
                )}
                rows={1}
                data-tour="chat-input-textarea"
              />
              {/* Slash Command Dropdown */}
              {slashCommand.isActive &&
                (slashCommand.filteredSkills.length > 0 ||
                  slashCommand.isEmptyWorkspace) && (
                  <SlashCommandDropdown
                    skills={slashCommand.filteredSkills}
                    selectedIndex={slashCommand.selectedIndex}
                    onSelect={slashCommand.handleSelect}
                    direction={dropdownDirection}
                    isEmptyWorkspace={slashCommand.isEmptyWorkspace}
                    onOpenWorkspaceSettings={() =>
                      dispatch(setWorkspaceSettingsOpen(true))
                    }
                  />
                )}
            </div>

            {/* Row 2: Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleUploadClick}
                  disabled={disabled || !supportsFileUpload}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground border-0 shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={t('uploadFile', { ns: 'common' })}
                  title={
                    supportsFileUpload
                      ? t('uploadFile', { ns: 'common' })
                      : t('fileUploadNotSupported', { ns: 'chat' })
                  }
                >
                  <Paperclip className="size-4" />
                </Button>

                {/* Flow Button - Only show if experimental feature is enabled */}
                {enableWorkflowEditor && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setFlowDialogOpen(true)}
                    disabled={disabled}
                    className="h-7 w-7 text-muted-foreground hover:text-foreground border-0 shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Add workflow"
                    title="Add workflow"
                  >
                    <Workflow className="size-4" />
                  </Button>
                )}

                {/* Tools Button with Hover Tooltip */}
                <div className="relative group">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled || !supportsToolCalling}
                    className={cn(
                      'h-7 w-7 text-muted-foreground hover:text-foreground border-0 shadow-none relative',
                      activeTools.length > 0 &&
                        'text-primary hover:text-primary',
                      !supportsToolCalling && 'opacity-50 cursor-not-allowed'
                    )}
                    aria-label={t('activeTools', { ns: 'chat' })}
                  >
                    <Wrench className="size-4" />
                  </Button>

                  {/* Hover Tooltip Panel */}
                  <div className="absolute bottom-full left-0 mb-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-[opacity,visibility] duration-200 z-50">
                    {/* Invisible bridge to keep hover active */}
                    <div className="absolute top-0 left-0 right-0 h-3 translate-y-full"></div>
                    <div className="bg-popover text-popover-foreground rounded-md border shadow-lg w-80">
                      <div className="space-y-2 p-3">
                        {!supportsToolCalling && (
                          <div className="mb-2 rounded bg-yellow-500/10 p-2 text-xs text-yellow-600 dark:text-yellow-400">
                            Model does not support tool calling
                          </div>
                        )}
                        <div className="font-semibold text-sm">
                          {t('activeTools', { ns: 'chat' }) || 'Active Tools'}
                          <span className="ml-1.5 text-muted-foreground font-normal">
                            ({activeTools.length})
                          </span>
                        </div>
                        {activeTools.length > 0 ? (
                          <div className="space-y-1.5 max-h-60 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                            {activeTools.map((tool, index) => (
                              <div
                                key={`${tool.name}-${index}`}
                                className="text-xs p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                              >
                                <div className="font-medium text-foreground">
                                  {tool.name}
                                </div>
                                <div className="text-muted-foreground text-[10px] mt-0.5">
                                  Server: {tool.serverName}
                                </div>
                                {tool.description && (
                                  <div className="text-muted-foreground mt-1 line-clamp-2">
                                    {tool.description}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground py-4 text-center">
                            {t('noActiveTools', { ns: 'chat' }) ||
                              'No active tools configured'}
                          </div>
                        )}
                      </div>
                      {/* Arrow */}
                      <div className="absolute top-full left-4 -mt-px border-4 border-transparent border-t-popover"></div>
                    </div>
                  </div>
                </div>

                {/* Thinking Mode Toggle */}
                {supportsThinking && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={disabled}
                        className={cn(
                          'h-7 w-7 text-muted-foreground hover:text-foreground border-0 shadow-none',
                          isThinkingEnabled && 'text-primary hover:text-primary'
                        )}
                        aria-label="Thinking Mode"
                      >
                        <Brain className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuLabel>Thinking Mode</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={isThinkingEnabled ? reasoningEffort : 'none'}
                        onValueChange={(val) => {
                          if (val === 'none') {
                            if (isThinkingEnabled) handleThinkingToggle();
                          } else {
                            if (!isThinkingEnabled) handleThinkingToggle();
                            handleReasoningEffortChange(
                              val as 'low' | 'medium' | 'high'
                            );
                          }
                        }}
                      >
                        <DropdownMenuRadioItem value="none">
                          None
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="low">
                          Low
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="medium">
                          Medium
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="high">
                          High
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Right side: Model Selector and Send Button */}
              <div className="flex items-center gap-2">
                {/* Character Counter */}
                {input.length > 0 && (
                  <div
                    className={cn(
                      'text-xs transition-colors',
                      input.length > MAX_MESSAGE_LENGTH
                        ? 'text-destructive'
                        : input.length > MAX_MESSAGE_LENGTH * 0.9
                          ? 'text-yellow-500'
                          : 'text-muted-foreground/50'
                    )}
                  >
                    {input.length.toLocaleString()} /{' '}
                    {MAX_MESSAGE_LENGTH.toLocaleString()}
                  </div>
                )}

                {/* Model Selector */}
                <Select
                  value={
                    selectedModel
                      ? selectedModel.includes('::')
                        ? selectedModel
                        : `${selectedLLMConnectionId}::${selectedModel}`
                      : ''
                  }
                  onValueChange={(val) => {
                    handleModelChange(val || undefined);
                  }}
                  onOpenChange={(open) => {
                    if (!open) {
                      setModelSearchTerm('');
                    }
                  }}
                  disabled={llmConnections.length === 0 || disabled}
                >
                  <SelectTrigger
                    className="h-7 w-auto min-w-[120px] text-sm border-none bg-transparent dark:bg-transparent hover:bg-muted/50 shadow-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    data-tour="model-selector"
                    hideIcon={true}
                  >
                    <SelectValue
                      placeholder={t('selectModel', { ns: 'settings' })}
                    >
                      {currentModelName ? (
                        <div className="flex items-center gap-2">
                          {currentConnection && (
                            <span className="text-muted-foreground font-medium opacity-70">
                              {currentConnection.name}:
                            </span>
                          )}
                          <span>{currentModelName}</span>
                        </div>
                      ) : (
                        t('selectModel', { ns: 'settings' })
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    className="max-h-[min(400px,var(--radix-select-content-available-height))]"
                    hideScrollButtons={true}
                    position="popper"
                    sideOffset={5}
                    header={
                      llmConnections.length > 0 ? (
                        <div
                          className="p-2 bg-popover border-b"
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="relative">
                            <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                            <Input
                              placeholder={t('searchModels', {
                                ns: 'settings',
                              })}
                              value={modelSearchTerm}
                              onChange={(e) =>
                                setModelSearchTerm(e.target.value)
                              }
                              className="pl-8 h-9 border-none shadow-none focus-visible:ring-0"
                              onKeyDown={(e) => {
                                // Prevent Radix Select from intercepting key events
                                e.stopPropagation();
                              }}
                              autoFocus
                            />
                          </div>
                        </div>
                      ) : null
                    }
                  >
                    {llmConnections.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        {t('pleaseSelectLLMConnection', { ns: 'settings' })}
                      </div>
                    ) : filteredLLMConnections.length === 0 ? (
                      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        {t('noModelsFound', {
                          ns: 'settings',
                          defaultValue: 'No models found',
                        })}
                      </div>
                    ) : (
                      filteredLLMConnections.map((conn: LLMConnection) => {
                        if (
                          !conn.models ||
                          !Array.isArray(conn.models) ||
                          conn.models.length === 0
                        ) {
                          return null;
                        }

                        return (
                          <div key={conn.id}>
                            <SelectGroup>
                              <SelectLabel className="px-3 py-2 text-[10px] uppercase tracking-widest font-extrabold text-foreground bg-muted/40 border-y border-border/50 mt-1 mb-1 first:mt-0">
                                {conn.name} ({conn.provider})
                              </SelectLabel>
                              {conn.models.map((model) => (
                                <SelectItem
                                  key={`${conn.id}::${model.id}`}
                                  value={`${conn.id}::${model.id}`}
                                >
                                  {model.name || model.id}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </div>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>

                {/* Send/Stop Button */}
                <Button
                  onClick={
                    input.trim() || insertedSkill
                      ? handleSubmit
                      : effectiveIsStreaming
                        ? handleStopStreaming
                        : undefined
                  }
                  disabled={
                    disabled ||
                    (!input.trim() && !insertedSkill && !effectiveIsStreaming)
                  }
                  size="icon"
                  className={cn(
                    'h-8 w-8 rounded-full transition-[background-color,color,transform] shadow-sm',
                    input.trim()
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105'
                      : effectiveIsStreaming
                        ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                  data-tour="send-message-btn"
                  aria-label={
                    effectiveIsStreaming && !input.trim()
                      ? t('stopStreaming', { ns: 'chat' })
                      : t('sendMessage', { ns: 'common' })
                  }
                >
                  {effectiveIsStreaming ? (
                    <Square className="size-4" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <FlowEditorDialog
        open={flowDialogOpen}
        initialFlow={attachedFlow || undefined}
        availableNodes={FLOW_NODES}
        onClose={() => setFlowDialogOpen(false)}
        onSave={(flow) => {
          setFlow(flow);
          setFlowDialogOpen(false);
        }}
      />
    </>
  );
}
