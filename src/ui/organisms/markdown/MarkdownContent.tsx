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
  const bufferTimeout = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (isStreaming) {
      // Initialize buffer when streaming starts
      setStreamBuffer(sanitizedContent);
      lastUpdateLength.current = sanitizedContent.length;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  useEffect(() => {
    if (!isStreaming) return;

    const newContentLength = sanitizedContent.length;
    const diff = newContentLength - lastUpdateLength.current;

    // Check newline count in the new chunk
    // Optimization: no need to slice if diff is zero
    if (diff === 0) return;

    const newChunk = sanitizedContent.slice(lastUpdateLength.current);
    const newlineCount = (newChunk.match(/\n/g) || []).length;

    // Bypass smoothing while streaming inside an open html fence
    const bypassForHtmlPreview = shouldBypassStreamBuffer(
      sanitizedContent,
      isStreaming
    );

    // Update if > 5 newlines or > 500 chars, html fence is open, or debounce timeout
    const shouldUpdate =
      bypassForHtmlPreview || newlineCount >= 5 || diff > 500;

    if (shouldUpdate) {
      if (bufferTimeout.current) clearTimeout(bufferTimeout.current);

      setStreamBuffer(sanitizedContent);
      lastUpdateLength.current = newContentLength;
    } else {
      if (bufferTimeout.current) clearTimeout(bufferTimeout.current);

      bufferTimeout.current = setTimeout(() => {
        setStreamBuffer(sanitizedContent);
        lastUpdateLength.current = newContentLength;
      }, 800);
    }

    return () => {
      if (bufferTimeout.current) clearTimeout(bufferTimeout.current);
    };
  }, [sanitizedContent, isStreaming]);

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
      <div className={cn('markdown-content', className)}>
        <MarkdownMessageProvider messageId={messageId}>
          <Streamdown
            mode="streaming"
            isAnimating={isStreaming}
            parseIncompleteMarkdown={true}
            controls
            components={components}
            shikiTheme={shikiTheme}
            className={cn(
              isStreaming &&
                '[&>*]:animate-in [&>*]:fade-in [&>*]:slide-in-from-bottom-1 [&>*]:duration-1000'
            )}
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
