import { formatDistanceToNow } from 'date-fns';
import { Package, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Artifact } from '../types';

interface ArtifactItemProps {
  artifact: Artifact;
  isActive?: boolean;
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

export function ArtifactItem({
  artifact,
  isActive = false,
  onOpen,
  onDelete,
}: ArtifactItemProps) {
  return (
    <div
      onClick={onOpen}
      className={cn(
        'group flex items-center justify-between gap-2 rounded-md border px-3 py-2 transition-[background-color,border-color] duration-200',
        isActive
          ? 'border-primary/30 bg-primary/10 ring-1 ring-primary/20'
          : 'border-border/40 bg-sidebar-accent/45 hover:border-border/80 hover:bg-sidebar-accent/70'
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline justify-between">
            <h4
              className={cn(
                'truncate text-[14px] font-medium leading-tight font-bold',
                isActive ? 'text-foreground' : 'text-foreground/85'
              )}
            >
              {artifact.title}
            </h4>
            <span className="shrink-0 text-[10px] text-muted-foreground/50">
              {formatDistanceToNow(artifact.created_at, { addSuffix: true })}
            </span>
          </div>
          <p className="truncate text-[11px] text-muted-foreground/60">
            {artifact.filename}
          </p>
        </div>
      </div>

      <button
        type="button"
        aria-label="Delete"
        onClick={onDelete}
        className="invisible flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:visible"
      >
        <Trash2 className="size-3.5 shrink-0" />
      </button>
    </div>
  );
}

export function ArtifactsEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center opacity-50">
      <Package className="mb-2 size-8 text-muted-foreground" />
      <p className="text-xs font-medium">{title}</p>
      <p className="mt-1 max-w-[200px] text-[11px] text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
