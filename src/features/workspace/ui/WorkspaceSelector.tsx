import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '@/ui/atoms/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/atoms/dropdown-menu';
import { AddWorkspaceDialog } from './AddWorkspaceDialog';
import { cn } from '@/lib/utils';
import { useWorkspaces } from '../hooks/useWorkspaces';
import type { Workspace } from '../types';

interface WorkspaceSelectorProps {
  onWorkspaceChange?: (workspace?: Workspace) => void;
  compact?: boolean;
}

export function WorkspaceSelector({
  onWorkspaceChange: onWorkspaceChangeCallback,
  compact = false,
}: WorkspaceSelectorProps = {}) {
  const { t } = useTranslation('settings');
  const [dialogOpen, setDialogOpen] = useState(false);

  const {
    workspaces,
    selectedWorkspace,
    handleWorkspaceChange,
    handleAddWorkspace,
  } = useWorkspaces();

  if (!selectedWorkspace) {
    return null;
  }

  const handleWorkspaceChangeWithCallback = (workspace: Workspace) => {
    handleWorkspaceChange(workspace);
    onWorkspaceChangeCallback?.(workspace);
  };

  const handleAddClick = () => {
    setDialogOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ variant: 'ghost' }),
            compact
              ? 'h-8 w-full justify-between gap-2 px-2 py-1'
              : 'h-auto gap-1.5 px-2 py-1'
          )}
          data-tour="workspace-selector"
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-5 shrink-0 items-center justify-center rounded bg-primary text-[10px] font-medium text-primary-foreground">
              {selectedWorkspace.name.charAt(0).toUpperCase()}
            </div>
            <span
              className={cn(
                'truncate font-medium',
                compact ? 'text-xs' : 'text-sm'
              )}
            >
              {selectedWorkspace.name}
            </span>
          </div>
          <ChevronDown className="size-3.5 shrink-0 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              onClick={() => {
                handleWorkspaceChangeWithCallback(workspace);
              }}
              className={cn(
                'cursor-pointer',
                selectedWorkspace.id === workspace.id && 'bg-accent'
              )}
            >
              <div className="flex items-center gap-2">
                <div className="flex size-5 items-center justify-center rounded bg-primary text-[10px] font-medium text-primary-foreground">
                  {workspace.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm">{workspace.name}</span>
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleAddClick} className="cursor-pointer">
            <div className="flex items-center gap-2">
              <Plus className="size-4" />
              <span>{t('addWorkspace')}</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AddWorkspaceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAddWorkspace={handleAddWorkspace}
      />
    </>
  );
}
