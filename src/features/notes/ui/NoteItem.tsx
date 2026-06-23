import { formatDistanceToNow } from 'date-fns';
import { FileText, Trash2 } from 'lucide-react';
import { Note } from '../state/notesSlice';
import { cn } from '@/lib/utils';

interface NoteItemProps {
  note: Note;
  isActive: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

export function NoteItem({ note, isActive, onClick, onDelete }: NoteItemProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-[background-color,border-color,box-shadow,ring] duration-200',
        isActive
          ? 'border-primary/30 bg-primary/10 shadow-sm ring-1 ring-primary/20'
          : 'border-border/40 bg-sidebar-accent/45 shadow-none hover:border-border/80 hover:bg-sidebar-accent/70 hover:shadow-xs'
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <FileText
          className={cn(
            'size-3.5 shrink-0 transition-transform duration-200',
            isActive ? 'text-primary' : 'text-muted-foreground/60'
          )}
        />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <h4
            className={cn(
              'truncate text-[13px] font-medium leading-tight p-0 m-0 transition-colors duration-200',
              isActive ? 'text-foreground' : 'text-foreground/85'
            )}
          >
            {note.title || 'Untitled'}
          </h4>
          <span className="shrink-0 text-[10px] font-normal text-muted-foreground/40">
            {formatDistanceToNow(note.updated_at, { addSuffix: false })}
          </span>
        </div>
      </div>

      <button
        onClick={onDelete}
        className="invisible flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:visible"
      >
        <Trash2 className="size-3.5 shrink-0" />
      </button>
    </div>
  );
}
