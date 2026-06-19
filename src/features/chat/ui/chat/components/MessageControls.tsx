import { memo } from 'react';
import { Copy, Check, Pencil, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTTS } from '@/hooks/useTTS';

interface MessageControlsProps {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'tool_call';
  content: string;
  isCopied: boolean;
  onEdit: () => void;
  onCopy: () => void;
  t: (key: string) => string;
  className?: string;
}

export const MessageControls = memo(function MessageControls({
  role,
  content,
  isCopied,
  onEdit,
  onCopy,
  t,
  className,
}: MessageControlsProps) {
  const { isPlaying, isAvailable, toggle } = useTTS();

  const handleToggleTTS = () => {
    toggle(content);
  };

  return (
    <div
      className={cn(
        'flex items-center gap-0.5',
        'rounded-md backdrop-blur-md',
        'bg-background/95 border border-border shadow-lg',
        'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
        className
      )}
    >
      {role === 'user' && (
        <button
          className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors group/btn"
          onClick={onEdit}
          title={t('edit') || 'Edit'}
        >
          <Pencil className="h-3.5 w-3.5 opacity-70 group-hover/btn:opacity-100 transition-opacity" />
        </button>
      )}
      {role === 'assistant' && (
        <button
          className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors group/btn"
          onClick={onEdit}
          title={t('edit') || 'Edit'}
        >
          <Pencil className="h-3.5 w-3.5 opacity-70 group-hover/btn:opacity-100 transition-opacity" />
        </button>
      )}
      <button
        className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors group/btn"
        onClick={onCopy}
        title={t('copy')}
      >
        {isCopied ? (
          <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
        ) : (
          <Copy className="h-3.5 w-3.5 opacity-70 group-hover/btn:opacity-100 transition-opacity" />
        )}
      </button>
      {isAvailable && (
        <button
          className={cn(
            'p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors group/btn',
            isPlaying && 'text-primary animate-pulse'
          )}
          onClick={handleToggleTTS}
          title={t('readAloud') || 'Read aloud'}
        >
          {isPlaying ? (
            <VolumeX className="h-3.5 w-3.5 opacity-70 group-hover/btn:opacity-100 transition-opacity" />
          ) : (
            <Volume2 className="h-3.5 w-3.5 opacity-70 group-hover/btn:opacity-100 transition-opacity" />
          )}
        </button>
      )}
    </div>
  );
});
