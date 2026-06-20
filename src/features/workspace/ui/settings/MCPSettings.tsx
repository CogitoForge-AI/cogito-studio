import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Loader2,
  XCircle,
  Wrench,
  ExternalLink,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/atoms/button/button';
import { Checkbox } from '@/ui/atoms/checkbox';
import { Label } from '@/ui/atoms/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/atoms/select';
import { EmptyState } from '@/ui/atoms/empty-state';
import { cn } from '@/lib/utils';
import type { MCPServerConnection } from '@/app/types';

interface MCPSettingsProps {
  allMcpConnections: MCPServerConnection[];
  selectedTools: Record<string, string>;
  onSelectedToolsChange: (
    updater: (prev: Record<string, string>) => Record<string, string>
  ) => void;
  toolPermissionConfig: Record<string, 'require' | 'auto'>;
  onToolPermissionConfigChange: (
    updater: (
      prev: Record<string, 'require' | 'auto'>
    ) => Record<string, 'require' | 'auto'>
  ) => void;
  onManageConnections?: () => void;
}

export function MCPSettings({
  allMcpConnections,
  selectedTools,
  onSelectedToolsChange,
  toolPermissionConfig,
  onToolPermissionConfigChange,
  onManageConnections,
}: MCPSettingsProps) {
  const { t } = useTranslation(['settings']);
  const [showAllMcpConnections, setShowAllMcpConnections] =
    useState<boolean>(false);
  const [collapsedServers, setCollapsedServers] = useState<Set<string>>(
    () => new Set(allMcpConnections.map((conn) => conn.id))
  );

  const connectedConnections = allMcpConnections.filter(
    (conn) => conn.status === 'connected'
  );
  const displayedConnections = showAllMcpConnections
    ? allMcpConnections
    : connectedConnections;

  const handleToolToggle = (toolName: string, connectionId: string) => {
    onSelectedToolsChange((prev) => {
      const newSelected = { ...prev };
      if (newSelected[toolName] === connectionId) {
        delete newSelected[toolName];
      } else {
        newSelected[toolName] = connectionId;
      }
      return newSelected;
    });
  };

  const toggleServerCollapse = (serverId: string) => {
    setCollapsedServers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(serverId)) {
        newSet.delete(serverId);
      } else {
        newSet.add(serverId);
      }
      return newSet;
    });
  };

  if (displayedConnections.length === 0) {
    const hasConnections = allMcpConnections.length > 0;

    return (
      <div className="flex min-h-[min(60vh,420px)] flex-col items-center justify-center px-4">
        <EmptyState
          icon={Wrench}
          title={
            hasConnections
              ? t('mcpToolsNoConnectedTitle', { ns: 'settings' })
              : t('mcpToolsEmptyTitle', { ns: 'settings' })
          }
          description={
            hasConnections
              ? t('mcpToolsNoConnectedDescription', { ns: 'settings' })
              : t('mcpToolsEmptyDescription', { ns: 'settings' })
          }
          className="py-8"
          action={
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              {onManageConnections && (
                <Button size="sm" onClick={onManageConnections}>
                  <ExternalLink className="mr-2 size-4" />
                  {t('mcpToolsManageConnections', { ns: 'settings' })}
                </Button>
              )}
              {hasConnections && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAllMcpConnections(true)}
                >
                  <ChevronDown className="mr-2 size-4" />
                  {t('showAll', { ns: 'settings' })}
                </Button>
              )}
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 w-full">
        <div className="flex items-center justify-between">
          {allMcpConnections.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowAllMcpConnections(!showAllMcpConnections)}
            >
              {showAllMcpConnections ? (
                <>
                  <ChevronUp className="size-3 mr-1" />
                  {t('showOnlyConnected', { ns: 'settings' })}
                </>
              ) : (
                <>
                  <ChevronDown className="size-3 mr-1" />
                  {t('showAll', { ns: 'settings' })}
                </>
              )}
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {displayedConnections.map((conn) => {
            const isConnected = conn.status === 'connected';
            const isConnecting = conn.status === 'connecting';
            const isDisconnected = conn.status === 'disconnected';
            const isCollapsed = collapsedServers.has(conn.id);

            let StatusIcon: React.ComponentType<{ className?: string }> | null =
              null;
            let statusColor = '';

            if (isConnected) {
              StatusIcon = CheckCircle2;
              statusColor = 'text-green-600 dark:text-green-400';
            } else if (isConnecting) {
              StatusIcon = Loader2;
              statusColor = 'text-yellow-600 dark:text-yellow-400';
            } else if (isDisconnected) {
              StatusIcon = XCircle;
              statusColor = 'text-gray-500 dark:text-gray-400';
            }

            const tools = conn.tools || [];
            const selectedToolsCount = tools.filter(
              (tool) => selectedTools[tool.name] === conn.id
            ).length;
            const allSelected =
              tools.length > 0 && selectedToolsCount === tools.length;
            const someSelected =
              selectedToolsCount > 0 && selectedToolsCount < tools.length;

            const handleSelectAllTools = (e: React.MouseEvent) => {
              e.stopPropagation();
              if (!isConnected) return;

              onSelectedToolsChange((prev) => {
                const newSelected = { ...prev };
                if (allSelected) {
                  tools.forEach((tool) => {
                    if (newSelected[tool.name] === conn.id) {
                      delete newSelected[tool.name];
                    }
                  });
                } else {
                  tools.forEach((tool) => {
                    newSelected[tool.name] = conn.id;
                  });
                }
                return newSelected;
              });
            };

            return (
              <div key={conn.id} className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                  onClick={() => toggleServerCollapse(conn.id)}
                >
                  <div className="flex items-center gap-2">
                    {StatusIcon && (
                      <StatusIcon
                        className={cn(
                          'size-4 shrink-0',
                          statusColor,
                          isConnecting && 'animate-spin'
                        )}
                      />
                    )}
                    <span className="font-semibold text-sm">{conn.name}</span>
                    <span className="text-xs text-muted-foreground">
                      (
                      {t('mcpSelectedToolsCount', {
                        ns: 'settings',
                        selected: selectedToolsCount,
                        total: tools.length,
                      })}
                      )
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {tools.length > 0 && (
                      <div
                        onClick={handleSelectAllTools}
                        className={cn(
                          'size-4 rounded border flex items-center justify-center transition-colors cursor-pointer',
                          !isConnected && 'opacity-50 cursor-not-allowed',
                          allSelected &&
                            isConnected &&
                            'bg-primary border-primary',
                          someSelected &&
                            !allSelected &&
                            isConnected &&
                            'bg-primary/50 border-primary'
                        )}
                        title={
                          allSelected
                            ? t('deselectAllTools', { ns: 'settings' })
                            : t('selectAllTools', { ns: 'settings' })
                        }
                      >
                        {allSelected && (
                          <svg
                            className="size-3 text-primary-foreground"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                        {someSelected && !allSelected && (
                          <div className="size-2 bg-primary-foreground rounded-sm" />
                        )}
                      </div>
                    )}
                    {isCollapsed ? (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-300" />
                    ) : (
                      <ChevronUp className="size-4 shrink-0 text-muted-foreground transition-transform duration-300" />
                    )}
                  </div>
                </button>

                <div
                  className={cn(
                    'transition-[grid-template-rows,opacity] duration-300 ease-in-out',
                    isCollapsed
                      ? 'grid grid-rows-[0fr] opacity-0'
                      : 'grid grid-rows-[1fr] opacity-100'
                  )}
                >
                  <div className="overflow-hidden">
                    {tools.length > 0 ? (
                      <div className="flex flex-col border-t divide-y">
                        {tools.map((tool) => {
                          const isSelected =
                            selectedTools[tool.name] === conn.id;
                          const configValue = toolPermissionConfig[tool.name];

                          return (
                            <div
                              key={tool.name}
                              className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
                            >
                              <div className="flex items-center gap-3 overflow-hidden">
                                <Checkbox
                                  id={`tool-${conn.id}-${tool.name}`}
                                  checked={isSelected}
                                  onCheckedChange={() =>
                                    isConnected &&
                                    handleToolToggle(tool.name, conn.id)
                                  }
                                  disabled={!isConnected}
                                />
                                <div className="flex flex-col overflow-hidden">
                                  <Label
                                    htmlFor={`tool-${conn.id}-${tool.name}`}
                                    className={cn(
                                      'text-sm font-medium cursor-pointer truncate',
                                      !isConnected && 'opacity-50'
                                    )}
                                  >
                                    {tool.name}
                                  </Label>
                                  {tool.description && (
                                    <span
                                      className="text-xs text-muted-foreground truncate max-w-[300px]"
                                      title={tool.description}
                                    >
                                      {tool.description}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {isSelected && (
                                  <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                                    <Select
                                      value={configValue || 'auto'}
                                      onValueChange={(value) => {
                                        onToolPermissionConfigChange((prev) => {
                                          const newConfig = { ...prev };
                                          if (value === 'auto') {
                                            delete newConfig[tool.name];
                                          } else {
                                            newConfig[tool.name] = value as
                                              | 'require'
                                              | 'auto';
                                          }
                                          return newConfig;
                                        });
                                      }}
                                      disabled={!isConnected}
                                    >
                                      <SelectTrigger
                                        className="w-[110px] h-7 text-xs"
                                        variant="ghost"
                                      >
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="auto">
                                          {t('permissionAuto', {
                                            ns: 'settings',
                                          })}
                                        </SelectItem>
                                        <SelectItem value="require">
                                          {t('permissionAsk', {
                                            ns: 'settings',
                                          })}
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-xs text-muted-foreground italic">
                        {t('noToolsAvailable', { ns: 'settings' })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
