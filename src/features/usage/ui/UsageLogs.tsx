import { useMemo, useState } from 'react';
import { UsageStat } from '@/models/usage';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/ui/atoms/table';
import { Button } from '@/ui/atoms/button';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Database,
} from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/atoms/card';
import { cn } from '@/lib/utils';
import { toEpochMs } from '../lib/timestamps';

interface UsageLogsProps {
  logs: UsageStat[];
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  hasMore: boolean;
  loading?: boolean;
}

type SortDirection = 'asc' | 'desc' | null;

const SkeletonRow = () => (
  <TableRow>
    <TableCell>
      <div className="h-4 w-24 bg-muted animate-pulse rounded" />
    </TableCell>
    <TableCell>
      <div className="h-4 w-32 bg-muted animate-pulse rounded" />
    </TableCell>
    <TableCell>
      <div className="h-4 w-28 bg-muted animate-pulse rounded" />
    </TableCell>
    <TableCell>
      <div className="h-4 w-16 bg-muted animate-pulse rounded" />
    </TableCell>
    <TableCell>
      <div className="h-4 w-20 bg-muted animate-pulse rounded" />
    </TableCell>
    <TableCell>
      <div className="h-4 w-16 bg-muted animate-pulse rounded" />
    </TableCell>
  </TableRow>
);

export function UsageLogs({
  logs,
  page,
  limit,
  onPageChange,
  hasMore,
  loading,
}: UsageLogsProps) {
  const [tokenSort, setTokenSort] = useState<SortDirection>(null);

  const handleTokenSort = () => {
    setTokenSort((prev) => {
      if (prev === null) return 'desc';
      if (prev === 'desc') return 'asc';
      return null;
    });
  };

  const sortedLogs = useMemo(() => {
    if (tokenSort === null) return logs;

    return [...logs].sort((a, b) => {
      const diff = a.total_tokens - b.total_tokens;
      return tokenSort === 'asc' ? diff : -diff;
    });
  }, [logs, tokenSort]);

  const TokenSortIcon =
    tokenSort === 'asc'
      ? ArrowUp
      : tokenSort === 'desc'
        ? ArrowDown
        : ArrowUpDown;

  return (
    <Card className="border border-border shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Database className="h-4 w-4 text-muted-foreground" />
          Request Logs
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Detailed history of all API requests
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="rounded-lg overflow-hidden border-t border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs font-medium text-muted-foreground">
                  Timestamp
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">
                  Model
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    onClick={handleTokenSort}
                  >
                    Tokens
                    <TokenSortIcon className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">
                  Latency
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">
                  Cost
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : sortedLogs.length > 0 ? (
                sortedLogs.map((log) => (
                  <TableRow
                    key={log.id}
                    className="hover:bg-muted/50 transition-colors"
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {format(
                        new Date(toEpochMs(log.timestamp)),
                        'MMM d, HH:mm:ss'
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm">{log.model}</span>
                        <span className="text-xs text-muted-foreground">
                          {log.provider}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5 font-mono text-xs tabular-nums">
                        <span className="text-chart-emerald font-medium">
                          ↓ {log.input_tokens.toLocaleString()}
                        </span>
                        <span className="text-chart-violet font-medium">
                          ↑ {log.output_tokens.toLocaleString()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm tabular-nums">
                      {log.latency_ms}
                      <span className="text-xs text-muted-foreground ml-0.5">
                        ms
                      </span>
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      ${log.cost.toFixed(5)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center px-2.5 py-1 rounded-full text-xs',
                          log.status === 'success'
                            ? 'bg-foreground/10 text-foreground'
                            : 'bg-destructive/10 text-destructive'
                        )}
                      >
                        {log.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-32">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Database className="h-6 w-6 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">
                        No logs found
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/10">
          <p className="text-sm text-muted-foreground">
            Page {page} • {sortedLogs.length}{' '}
            {sortedLogs.length === 1 ? 'item' : 'items'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1 || loading}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={(!hasMore && logs.length < limit) || loading}
              className="gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
