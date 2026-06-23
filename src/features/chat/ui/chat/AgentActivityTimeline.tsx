import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Brain, Loader2, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAppDispatch } from '@/app/hooks';
import { showError } from '@/features/notifications/state/notificationSlice';
import {
  summarizeActivity,
  type AgentActivity,
  type ActivityStep,
} from './utils/messageGrouping';
import { ToolCallItem } from './ToolCallItem';
import type { PermissionRequest } from '@/features/tools/state/toolPermissionSlice';

interface AgentActivityTimelineProps {
  activity: AgentActivity;
  onPermissionRespond?: (
    messageId: string,
    toolId: string,
    toolName: string,
    approved: boolean
  ) => void | Promise<void>;
  onCancelToolExecution?: () => void;
  pending: PermissionRequest | null;
  pendingMessageId: string;
  t: (key: string, defaultValue?: string) => string;
}

const PERMISSION_TIMEOUT_MS = 60_000;

function CompactThinkingRow({
  step,
}: {
  step: Extract<ActivityStep, { kind: 'thinking' }>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(step.isStreaming);

  if (!step.content.trim() && !step.isStreaming) return null;

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group/thought"
    >
      <summary className="flex list-none items-center gap-1.5 py-0.5 text-[11px] text-muted-foreground/80 hover:text-muted-foreground">
        <ChevronRight className="size-3 shrink-0 transition-transform group-open/thought:rotate-90" />
        {step.isStreaming ? (
          <Loader2 className="size-3 shrink-0 animate-spin text-primary/70" />
        ) : (
          <Brain className="size-3 shrink-0" />
        )}
        <span>
          {step.isStreaming
            ? t('thinking', 'Thinking...')
            : t('thought', 'Thought')}
        </span>
      </summary>
      {step.content.trim() ? (
        <div className="ml-4 mt-0.5 max-h-28 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground/75">
          {step.content}
        </div>
      ) : null}
    </details>
  );
}

function CompactSnippetRow({
  step,
}: {
  step: Extract<ActivityStep, { kind: 'snippet' }>;
}) {
  const preview = step.message.content.trim();
  if (!preview) return null;

  const short =
    preview.length > 120 ? `${preview.slice(0, 120).trim()}…` : preview;

  return (
    <div className="flex items-start gap-1.5 py-0.5 text-[11px] text-muted-foreground/75">
      <span className="mt-0.5 size-1 shrink-0 rounded-full bg-muted-foreground/35" />
      <span className="whitespace-pre-wrap leading-relaxed">{short}</span>
    </div>
  );
}

export const AgentActivityTimeline = memo(function AgentActivityTimeline({
  activity,
  onPermissionRespond,
  onCancelToolExecution,
  pending,
  pendingMessageId,
  t,
}: AgentActivityTimelineProps) {
  const dispatch = useAppDispatch();
  const { t: translate } = useTranslation('chat');
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const timeoutHandledRef = useRef<string | null>(null);
  const open = userOpen ?? activity.defaultExpanded;
  const summary = useMemo(
    () => summarizeActivity(activity.steps),
    [activity.steps]
  );

  useEffect(() => {
    if (!pending || !onPermissionRespond) {
      timeoutHandledRef.current = null;
      return;
    }

    const timeoutKey = `${pending.messageId}:${pending.timestamp}`;
    if (timeoutHandledRef.current === timeoutKey) {
      return;
    }

    const remaining = Math.max(
      0,
      pending.timestamp + PERMISSION_TIMEOUT_MS - Date.now()
    );

    const timeoutId = window.setTimeout(() => {
      timeoutHandledRef.current = timeoutKey;
      pending.toolCalls.forEach((toolCall) => {
        void onPermissionRespond(
          pending.messageId,
          toolCall.id,
          toolCall.name,
          false
        );
      });
      dispatch(
        showError(
          translate(
            'toolPermissionTimeout',
            'Tool permission request timed out'
          )
        )
      );
    }, remaining);

    return () => window.clearTimeout(timeoutId);
  }, [dispatch, onPermissionRespond, pending, translate]);

  if (activity.steps.length === 0 && !pending) return null;

  return (
    <div>
      {activity.steps.length > 0 ? (
        <details
          open={open}
          className="group/activity rounded-md border border-border/40 bg-muted/10"
        >
          <summary
            className="flex list-none items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={(event) => {
              event.preventDefault();
              setUserOpen((current) => !(current ?? activity.defaultExpanded));
            }}
          >
            <ChevronRight className="size-3 shrink-0 transition-transform group-open/activity:rotate-90" />
            <Wrench className="size-3 shrink-0 opacity-60" />
            <span className="truncate">{summary}</span>
          </summary>
          <div className="space-y-0.5 border-t border-border/30 px-2 py-1.5">
            {activity.steps.map((step) => {
              if (step.kind === 'thinking') {
                return <CompactThinkingRow key={step.id} step={step} />;
              }
              if (step.kind === 'snippet') {
                return <CompactSnippetRow key={step.id} step={step} />;
              }

              return (
                <ToolCallItem
                  key={step.id}
                  message={step.message}
                  data={step.data}
                  variant="compact"
                  onCancel={onCancelToolExecution}
                  defaultExpanded={false}
                  t={t}
                />
              );
            })}
          </div>
        </details>
      ) : null}

      {pending
        ? pending.toolCalls.map((toolCall) => {
            return (
              <div
                key={toolCall.id}
                className={cn(activity.steps.length > 0 && 'mt-1')}
              >
                <ToolCallItem
                  data={{
                    id: toolCall.id,
                    name: toolCall.name,
                    arguments: toolCall.arguments,
                    status: 'pending_permission',
                  }}
                  variant="compact"
                  onCancel={onCancelToolExecution}
                  defaultExpanded={true}
                  requestTimestamp={pending.timestamp}
                  t={t}
                  onRespond={
                    onPermissionRespond
                      ? (allow: boolean) =>
                          onPermissionRespond(
                            pendingMessageId,
                            toolCall.id,
                            toolCall.name,
                            allow
                          )
                      : undefined
                  }
                />
              </div>
            );
          })
        : null}
    </div>
  );
});
