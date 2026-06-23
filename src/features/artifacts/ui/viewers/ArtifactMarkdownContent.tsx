import { Suspense, isValidElement, lazy, useMemo } from 'react';
import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import { useAppSelector } from '@/app/hooks';
import { Streamdown } from '@/ui/atoms/streamdown';
import { cn } from '@/lib/utils';
import { containsMathSyntax } from '@/lib/markdown/containsMathSyntax';
import { CodeBlockSkeleton } from '@/ui/atoms/streamdown/lib/code-block/skeleton';
import type { ExtraProps } from '@/ui/atoms/streamdown/lib/markdown';
import { MermaidComponent } from '@/ui/atoms/streamdown/lib/mermaid-component';
import { MarkdownImage } from '@/ui/organisms/markdown/MarkdownImage';
import type { BundledTheme } from 'shiki';

const CodeBlock = lazy(() =>
  import('@/ui/atoms/streamdown/lib/code-block').then((mod) => ({
    default: mod.CodeBlock,
  }))
);

const LazyMathStreamdown = lazy(() =>
  import('@/ui/organisms/markdown/LazyMathStreamdown').then((mod) => ({
    default: mod.LazyMathStreamdown,
  }))
);

const LANGUAGE_REGEX = /language-([^\s]+)/;

function ArtifactCodeComponent({
  node,
  className,
  children,
  ...props
}: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & ExtraProps) {
  const inline = node?.position?.start.line === node?.position?.end.line;
  const match = className?.match(LANGUAGE_REGEX);
  const language = match ? match[1] : '';

  let code = '';
  if (
    isValidElement(children) &&
    children.props &&
    typeof children.props === 'object' &&
    'children' in children.props &&
    typeof children.props.children === 'string'
  ) {
    code = children.props.children;
  } else if (typeof children === 'string') {
    code = children;
  }

  if (inline) {
    return (
      <code
        className={cn(
          'rounded-md border border-border/50 bg-muted/45 px-1.5 py-0.5 font-mono text-[0.875em] text-foreground',
          className
        )}
        data-streamdown="inline-code"
        {...props}
      >
        {children}
      </code>
    );
  }

  if (language === 'mermaid') {
    return <MermaidComponent code={code} className={className} />;
  }

  return (
    <div className="my-1">
      <Suspense fallback={<CodeBlockSkeleton />}>
        <CodeBlock code={code} language={language} />
      </Suspense>
    </div>
  );
}

interface ArtifactMarkdownContentProps {
  content: string;
  className?: string;
}

export function ArtifactMarkdownContent({
  content,
  className,
}: ArtifactMarkdownContentProps) {
  const currentTheme = useAppSelector((state) => state.ui.theme);
  const hasMathSyntax = useMemo(() => containsMathSyntax(content), [content]);

  const shikiTheme = useMemo<[BundledTheme, BundledTheme]>(() => {
    if (currentTheme === 'light' || currentTheme === 'system') {
      return ['github-light', 'github-dark'];
    }
    if (currentTheme === 'dark') {
      return ['github-light', 'github-dark'];
    }

    switch (currentTheme) {
      case 'github-light':
        return ['github-light', 'github-light'];
      case 'github-dark':
        return ['github-dark', 'github-dark'];
      case 'gruvbox':
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
        return ['material-theme-lighter', 'material-theme-lighter'];
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

  const components = useMemo(
    () => ({
      code: ArtifactCodeComponent,
      img: MarkdownImage,
    }),
    []
  );

  return (
    <div className={cn('markdown-content select-text', className)}>
      {hasMathSyntax ? (
        <Suspense
          fallback={
            <Streamdown
              mode="static"
              isAnimating={false}
              parseIncompleteMarkdown={false}
              controls={{ table: false, mermaid: true }}
              components={components}
              shikiTheme={shikiTheme}
            >
              {content}
            </Streamdown>
          }
        >
          <LazyMathStreamdown
            mode="static"
            isAnimating={false}
            parseIncompleteMarkdown={false}
            controls={{ table: false, mermaid: true }}
            components={components}
            shikiTheme={shikiTheme}
          >
            {content}
          </LazyMathStreamdown>
        </Suspense>
      ) : (
        <Streamdown
          mode="static"
          isAnimating={false}
          parseIncompleteMarkdown={false}
          controls={{ table: false, mermaid: true }}
          components={components}
          shikiTheme={shikiTheme}
        >
          {content}
        </Streamdown>
      )}
    </div>
  );
}
