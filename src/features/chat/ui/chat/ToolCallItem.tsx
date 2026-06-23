import {
  useMemo,
  useCallback,
  memo,
  useEffect,
  useState,
  type MouseEvent,
} from 'react';
import {
  Wrench,
  AlertCircle,
  Loader2,
  Check,
  X,
  StopCircle,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/atoms/button/button';
import type { Message } from '../../types';
import { ExpandableMessageItem } from './ExpandableMessageItem';
import { parseToolCallMessage } from './utils/toolCallParsing';

export interface ToolCallData {
  id: string;
  name: string;
  arguments: unknown;
  status: string;
  result?: unknown;
  error?: string;
}

export interface ToolCallItemProps {
  message?: Message;
  data?: ToolCallData;
  variant?: 'default' | 'compact';
  defaultExpanded?: boolean;
  t: (key: string, defaultValue?: string) => string;
  onRespond?: (allow: boolean) => void;
  onCancel?: () => void;
  requestTimestamp?: number;
}

const PERMISSION_TIMEOUT_MS = 60_000;

function formatJSONSafety(str: unknown): string {
  if (str === undefined || str === null) return '';

  if (typeof str === 'object') {
    return JSON.stringify(str, null, 2);
  }

  if (typeof str === 'string') {
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  }

  return String(str);
}

function ToolCallDetails({
  toolCallData,
  isExecuting,
  isPending,
  isError,
  t,
}: {
  toolCallData: ToolCallData;
  isExecuting: boolean;
  isPending: boolean;
  isError: boolean;
  t: ToolCallItemProps['t'];
}) {
  return (
    <div className="space-y-2 pb-1">
      <div>
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/50">
          {t('toolCallInput')}
        </div>
        <pre className="overflow-x-auto rounded border border-border/30 bg-muted/20 p-2 font-mono text-[11px] leading-relaxed">
          {formatJSONSafety(toolCallData.arguments)}
        </pre>
      </div>

      {isExecuting && !isPending ? (
        <div className="flex items-center gap-1.5 pl-0.5 text-[11px] italic text-muted-foreground/60">
          <Loader2 className="size-3 animate-spin" />
          <span>{t('toolCallExecuting')}</span>
        </div>
      ) : isPending ? (
        <div className="rounded border border-amber-500/10 bg-amber-500/5 p-2 text-[11px] italic text-amber-600/80">
          {t('waitingForApproval', 'Waiting for approval...')}
        </div>
      ) : isError ? (
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-destructive/50">
            {t('toolCallError')}
          </div>
          <div className="rounded border border-destructive/10 bg-destructive/5 p-2 font-mono text-[11px] text-destructive/80">
            {toolCallData.error}
          </div>
        </div>
      ) : toolCallData.result !== undefined ? (
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/50">
            {t('toolCallOutput')}
          </div>
          <pre className="overflow-x-auto rounded border border-border/30 bg-muted/20 p-2 font-mono text-[11px] leading-relaxed">
            {formatJSONSafety(toolCallData.result)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export const ToolCallItem = memo(
  function ToolCallItem({
    message,
    data,
    variant = 'default',
    defaultExpanded = false,
    t,
    onRespond,
    onCancel,
    requestTimestamp,
  }: ToolCallItemProps) {
    const toolCallData = useMemo(
      () => parseToolCallMessage(message, data),
      [message, data]
    );

    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const isPendingStatus = toolCallData?.status === 'pending_permission';
    const [timeLeft, setTimeLeft] = useState<number | undefined>(() => {
      if (!isPendingStatus || requestTimestamp === undefined) {
        return undefined;
      }

      const remaining = Math.max(
        0,
        PERMISSION_TIMEOUT_MS - (Date.now() - requestTimestamp)
      );
      return Math.ceil(remaining / 1000);
    });

    const handleToggle = useCallback(() => {
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;
      setIsExpanded((current) => !current);
    }, []);

    const handleRespond = useCallback(
      (e: MouseEvent<HTMLButtonElement>, allow: boolean) => {
        e.stopPropagation();
        onRespond?.(allow);
      },
      [onRespond]
    );

    const handleCancel = useCallback(
      (e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        onCancel?.();
      },
      [onCancel]
    );

    useEffect(() => {
      if (!isPendingStatus || requestTimestamp === undefined) {
        return;
      }

      const updateTimeLeft = () => {
        const remaining = Math.max(
          0,
          PERMISSION_TIMEOUT_MS - (Date.now() - requestTimestamp)
        );
        setTimeLeft(Math.ceil(remaining / 1000));
      };

      updateTimeLeft();
      const interval = window.setInterval(updateTimeLeft, 1000);
      return () => window.clearInterval(interval);
    }, [isPendingStatus, requestTimestamp]);

    if (!toolCallData) {
      return null;
    }

    const isExecuting =
      toolCallData.status === 'executing' || toolCallData.status === 'calling';
    const isError = toolCallData.status === 'error';
    const isCompleted = toolCallData.status === 'completed';
    const isPending = toolCallData.status === 'pending_permission';

    const statusIcon = isExecuting ? (
      <Loader2 className="size-3 shrink-0 animate-spin text-primary/70" />
    ) : isError ? (
      <AlertCircle className="size-3 shrink-0 text-destructive" />
    ) : isCompleted && !isError ? (
      <Check className="size-3 shrink-0 text-emerald-500" />
    ) : (
      <Wrench className="size-3 shrink-0 opacity-60" />
    );

    const permissionBadge = isPending ? (
      <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
        {t('permissionRequired', 'Required')}
      </span>
    ) : null;

    const timeLeftBadge =
      isPending && timeLeft !== undefined && timeLeft > 0 ? (
        <span
          className={cn(
            'font-mono text-[10px]',
            timeLeft <= 10
              ? 'font-bold text-destructive'
              : 'text-muted-foreground'
          )}
        >
          ({timeLeft}s)
        </span>
      ) : null;

    const actionButtons = (
      <>
        {isPending && onRespond ? (
          <div className="flex items-center gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="size-5 text-emerald-600 hover:bg-emerald-500/10"
              onClick={(e) => handleRespond(e, true)}
              title="Allow"
            >
              <Check className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-5 text-destructive hover:bg-destructive/10"
              onClick={(e) => handleRespond(e, false)}
              title="Deny"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ) : null}
        {isExecuting && !isPending && onCancel ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-5 text-destructive hover:bg-destructive/10"
            onClick={handleCancel}
            title={t('cancelToolExecution') || 'Cancel'}
          >
            <StopCircle className="size-3.5" />
          </Button>
        ) : null}
      </>
    );

    if (variant === 'compact') {
      return (
        <details
          open={isExpanded}
          className="group/tool rounded-sm hover:bg-muted/20"
        >
          <summary
            className="flex list-none items-center gap-1.5 py-0.5 pr-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={(event) => {
              event.preventDefault();
              handleToggle();
            }}
          >
            <ChevronRight className="size-3 shrink-0 transition-transform group-open/tool:rotate-90" />
            {statusIcon}
            <span className="truncate">{toolCallData.name}</span>
            {permissionBadge}
            {timeLeftBadge}
            <span className="ml-auto flex items-center gap-0.5">
              {actionButtons}
            </span>
          </summary>
          <div className="ml-4 border-l border-border/30 pl-2">
            <ToolCallDetails
              toolCallData={toolCallData}
              isExecuting={isExecuting}
              isPending={isPending}
              isError={isError}
              t={t}
            />
          </div>
        </details>
      );
    }

    return (
      <ExpandableMessageItem
        isExpanded={isExpanded}
        onToggle={handleToggle}
        headerClassName="mb-2"
        contentClassName="p-0 m-0"
        header={
          <>
            {statusIcon}
            <span className="max-w-[200px] truncate">{toolCallData.name}</span>
            {permissionBadge}
            {timeLeftBadge}
          </>
        }
        actionsClassName={isPending ? 'opacity-100' : undefined}
        actions={actionButtons}
      >
        <ToolCallDetails
          toolCallData={toolCallData}
          isExecuting={isExecuting}
          isPending={isPending}
          isError={isError}
          t={t}
        />
      </ExpandableMessageItem>
    );
  },
  (prevProps, nextProps) => {
    const prevId = prevProps.message?.id || prevProps.data?.id;
    const nextId = nextProps.message?.id || nextProps.data?.id;

    const prevDataStr = prevProps.data
      ? JSON.stringify(prevProps.data)
      : prevProps.message?.content;
    const nextDataStr = nextProps.data
      ? JSON.stringify(nextProps.data)
      : nextProps.message?.content;

    return (
      prevId === nextId &&
      prevDataStr === nextDataStr &&
      prevProps.defaultExpanded === nextProps.defaultExpanded &&
      prevProps.requestTimestamp === nextProps.requestTimestamp &&
      prevProps.variant === nextProps.variant
    );
  }
);
