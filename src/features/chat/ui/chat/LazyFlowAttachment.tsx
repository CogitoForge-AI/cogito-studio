import { Suspense, lazy } from 'react';
import { Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlowData } from '@/features/chat/types';

interface LazyFlowAttachmentProps {
  flow: FlowData;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
  mode?: 'chatinput' | 'message';
}

const FlowAttachment = lazy(() =>
  import('./FlowAttachment').then((mod) => ({
    default: mod.FlowAttachment,
  }))
);

function FlowAttachmentFallback({
  flow,
  onClick,
  className,
  mode = 'chatinput',
}: LazyFlowAttachmentProps) {
  const nodeCount = flow.nodes?.length || 0;
  const edgeCount = flow.edges?.length || 0;

  return (
    <div
      className={cn(
        'group relative rounded-lg border border-border overflow-hidden',
        mode === 'chatinput' ? 'w-64 h-40' : 'w-80 h-48',
        className
      )}
    >
      <button
        type="button"
        className="flex h-full w-full flex-col items-center justify-center bg-muted/20 text-muted-foreground"
        onClick={onClick}
      >
        <Workflow className="mb-2 size-8 opacity-50" />
        <span className="text-xs font-medium">
          {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
          {edgeCount > 0
            ? ` • ${edgeCount} ${edgeCount === 1 ? 'connection' : 'connections'}`
            : ''}
        </span>
      </button>
    </div>
  );
}

export function LazyFlowAttachment(props: LazyFlowAttachmentProps) {
  return (
    <Suspense fallback={<FlowAttachmentFallback {...props} />}>
      <FlowAttachment {...props} />
    </Suspense>
  );
}
