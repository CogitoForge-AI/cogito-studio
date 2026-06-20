import {
  Component,
  ErrorInfo,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Streamdown } from '@/ui/atoms/streamdown';
import { useAppSelector } from '@/app/hooks';
import { cn } from '@/lib/utils';
import { useComponentPerformance } from '@/hooks/useComponentPerformance';
import { logger } from '@/lib/logger';
import { shouldBypassStreamBuffer } from '@/features/chat/lib/html-preview';
import { CustomCodeComponent } from './CustomCodeComponent';
import { MarkdownMessageProvider } from './MarkdownMessageContext';
import { MarkdownImage } from './MarkdownImage';
import type { BundledTheme } from 'shiki';

export function MarkdownContent({
  content,
  className,
  messageId,
  isStreaming = false,
}: MarkdownContentProps) {
  // Track render performance for markdown rendering
  useComponentPerformance({
    componentName: 'MarkdownContent',
    threshold: 200,
  });

  const { t } = useTranslation('common');
  const sanitizedContent =
    typeof content === 'string' ? content : String(content || '');

  // Get current app theme for code block syntax highlighting
  const currentTheme = useAppSelector((state) => state.ui.theme);

  // Map app themes to Shiki themes
  const shikiTheme = useMemo<[BundledTheme, BundledTheme]>(() => {
    // For 'system' and 'light'/'dark', use default GitHub themes
    if (currentTheme === 'light' || currentTheme === 'system') {
      return ['github-light', 'github-dark'];
    }
    if (currentTheme === 'dark') {
      return ['github-light', 'github-dark'];
    }

    // Map custom themes to appropriate Shiki themes
    switch (currentTheme) {
      case 'github-light':
        return ['github-light', 'github-light'];
      case 'github-dark':
        return ['github-dark', 'github-dark'];
      case 'gruvbox':
        // gruvbox-dark-hard is available, using material-theme-lighter as fallback for light
        return ['material-theme-lighter', 'material-theme-darker'] as [
          BundledTheme,
          BundledTheme,
        ];
      case 'dracula':
        return ['dracula', 'dracula'];
      case 'solarized-light':
        return ['solarized-light', 'solarized-light'];
      case 'solarized-dark':
        return ['solarized-dark', 'solarized-dark'];
      case 'one-dark-pro':
        return ['one-dark-pro', 'one-dark-pro'];
      case 'one-light':
        return ['one-light', 'one-light'];
      case 'monokai':
        return ['monokai', 'monokai'];
      case 'nord':
        return ['nord', 'nord'];
      case 'ayu-dark':
        return ['ayu-dark', 'ayu-dark'];
      default:
        return ['github-light', 'github-dark'];
    }
  }, [currentTheme]);

  const [streamBuffer, setStreamBuffer] = useState(sanitizedContent);
  const lastUpdateLength = useRef(sanitizedContent.length);
  const lastFlushTime = useRef(0);
  const bufferTimeout = useRef<NodeJS.Timeout>();
  const STREAM_FLUSH_MS = 500;

  useEffect(() => {
    if (isStreaming) {
      // Initialize buffer when streaming starts
      setStreamBuffer(sanitizedContent);
      lastUpdateLength.current = sanitizedContent.length;
      lastFlushTime.current = performance.now();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  useEffect(() => {
    if (!isStreaming) return;

    const newContentLength = sanitizedContent.length;
    const diff = newContentLength - lastUpdateLength.current;
    if (diff === 0) return;

    const bypassForHtmlPreview = shouldBypassStreamBuffer(
      sanitizedContent,
      isStreaming
    );

    const flushBuffer = () => {
      setStreamBuffer(sanitizedContent);
      lastUpdateLength.current = newContentLength;
      lastFlushTime.current = performance.now();
    };

    const now = performance.now();
    const elapsed = now - lastFlushTime.current;
    const shouldFlushNow =
      bypassForHtmlPreview || diff > 2000 || elapsed >= STREAM_FLUSH_MS;

    if (shouldFlushNow) {
      if (bufferTimeout.current) clearTimeout(bufferTimeout.current);
      flushBuffer();
    } else if (!bufferTimeout.current) {
      bufferTimeout.current = setTimeout(() => {
        bufferTimeout.current = undefined;
        flushBuffer();
      }, STREAM_FLUSH_MS - elapsed);
    }
  }, [sanitizedContent, isStreaming]);

  useEffect(() => {
    if (isStreaming) return;
    if (bufferTimeout.current) {
      clearTimeout(bufferTimeout.current);
      bufferTimeout.current = undefined;
    }
  }, [isStreaming]);

  const displayedContent = isStreaming ? streamBuffer : sanitizedContent;

  // Override code component to add run button
  const components = useMemo(
    () => ({
      code: CustomCodeComponent,
      img: MarkdownImage,
    }),
    []
  );

  return (
    <MarkdownErrorBoundary
      fallback={(error) => (
        <div className={cn('markdown-content', className)}>
          <div className="whitespace-pre-wrap wrap-break-words text-sm text-muted-foreground">
            {sanitizedContent}
          </div>
          {error && (
            <div className="mt-2 text-xs text-destructive">
              {t('markdownDisplayError')} {error.message}
            </div>
          )}
        </div>
      )}
    >
      <div
        className={cn(
          'markdown-content',
          className,
          isStreaming && 'cursor-default [&_*]:cursor-default'
        )}
      >
        <MarkdownMessageProvider messageId={messageId}>
          <Streamdown
            mode="streaming"
            isAnimating={isStreaming}
            parseIncompleteMarkdown={true}
            controls={{ table: false, mermaid: true }}
            components={components}
            shikiTheme={shikiTheme}
          >
            {displayedContent}
          </Streamdown>
        </MarkdownMessageProvider>
      </div>
    </MarkdownErrorBoundary>
  );
}

interface MarkdownContentProps {
  content: string;
  className?: string;
  messageId?: string;
  isStreaming?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class MarkdownErrorBoundary extends Component<
  { children: ReactNode; fallback: (error?: Error) => ReactNode },
  ErrorBoundaryState
> {
  constructor(props: {
    children: ReactNode;
    fallback: (error?: Error) => ReactNode;
  }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Markdown rendering error:', { error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return <>{this.props.fallback(this.state.error)}</>;
    }
    return <>{this.props.children}</>;
  }
}
