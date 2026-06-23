// @ts-nocheck
'use client';

import type { MermaidConfig } from 'mermaid';
import {
 type CSSProperties,
 createContext,
 memo,
 useEffect,
 useId,
 useMemo,
 useState,
 useTransition,
} from 'react';
import { harden } from 'rehype-harden';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkCjkFriendly from 'remark-cjk-friendly';
import remarkCjkFriendlyGfmStrikethrough from 'remark-cjk-friendly-gfm-strikethrough';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remend from 'remend';
import type { BundledTheme } from 'shiki';
import type { Pluggable } from 'unified';
import { components as defaultComponents } from './components';
import { Markdown, type Options } from './markdown';
import { parseMarkdownIntoBlocks } from './parse-blocks';
import { cn } from './utils';
export type { MermaidConfig } from 'mermaid';
export type { BundledLanguageName } from './code-block/bundled-languages';
export { parseMarkdownIntoBlocks } from './parse-blocks';

export type ControlsConfig =
 | boolean
 | {
 table?: boolean;
 code?: boolean;
 mermaid?:
 | boolean
 | {
 download?: boolean;
 copy?: boolean;
 fullscreen?: boolean;
 panZoom?: boolean;
 };
 };

export type MermaidErrorComponentProps = {
 error: string;
 chart: string;
 retry: () => void;
};

export type MermaidOptions = {
 config?: MermaidConfig;
 errorComponent?: React.ComponentType<MermaidErrorComponentProps>;
};

export type StreamdownProps = Options & {
 mode?: 'static' | 'streaming';
 BlockComponent?: React.ComponentType<BlockProps>;
 parseMarkdownIntoBlocksFn?: (markdown: string) => string[];
 parseIncompleteMarkdown?: boolean;
 className?: string;
 shikiTheme?: [BundledTheme, BundledTheme];
 mermaid?: MermaidOptions;
 controls?: ControlsConfig;
 isAnimating?: boolean;
 caret?: keyof typeof carets;
 cdnUrl?: string | null;
 remend?: Record<string, unknown> | undefined;
};

const mathSanitizeSchema = {
 ...defaultSchema,
 attributes: {
 ...defaultSchema.attributes,
 code: [['className', /^language-./, 'math-inline', 'math-display']],
 },
};

export const defaultRehypePlugins: Record<string, Pluggable> = {
 raw: rehypeRaw,
 sanitize: [rehypeSanitize, mathSanitizeSchema],
 harden: [
 harden,
 {
 allowedImagePrefixes: ['*'],
 allowedLinkPrefixes: ['*'],
 allowedProtocols: ['*'],
 defaultOrigin: undefined,
 allowDataImages: true,
 },
 ],
} as const;

export const defaultRemarkPlugins: Record<string, Pluggable> = {
 gfm: [remarkGfm, {}],
 math: [remarkMath, { singleDollarTextMath: true }],
 cjkFriendly: [remarkCjkFriendly, {}],
 cjkFriendlyGfmStrikethrough: [remarkCjkFriendlyGfmStrikethrough, {}],
} as const;

// Stable plugin arrays for cache efficiency - created once at module level
export const defaultRehypePluginsArray = Object.values(defaultRehypePlugins);
export const defaultRemarkPluginsArray = Object.values(defaultRemarkPlugins);

const carets = {
 block: ' ▋',
 circle: ' ●',
};

// Combined context for better performance - reduces React tree depth from 5 nested providers to 1
export type StreamdownContextType = {
 shikiTheme: [BundledTheme, BundledTheme];
 controls: ControlsConfig;
 isAnimating: boolean;
 mode: 'static' | 'streaming';
 mermaid?: MermaidOptions;
 cdnUrl?: string | null;
};

const defaultStreamdownContext: StreamdownContextType = {
 shikiTheme: ['github-light' as BundledTheme, 'github-dark' as BundledTheme],
 controls: true,
 isAnimating: false,
 mode: 'streaming',
 mermaid: undefined,
 cdnUrl: undefined,
};

export const StreamdownContext = createContext<StreamdownContextType>(
 defaultStreamdownContext
);

type BlockProps = Options & {
 content: string;
 shouldParseIncompleteMarkdown: boolean;
 index: number;
};

export const Block = memo(
 ({ content, ...props }: BlockProps) => {
 // Note: remend is already applied to the entire markdown before parsing into blocks
 // in the Streamdown component, so we don't need to apply it again here
 return <Markdown {...props}>{content}</Markdown>;
 },
 (prevProps, nextProps) => {
 // Deep comparison for better memoization
 if (prevProps.content !== nextProps.content) {
 return false;
 }

 if (prevProps.index !== nextProps.index) {
 return false;
 }

 // Check if components object changed (shallow comparison)
 if (prevProps.components !== nextProps.components) {
 // If references differ, check if keys are the same
 const prevKeys = Object.keys(prevProps.components || {});
 const nextKeys = Object.keys(nextProps.components || {});

 if (prevKeys.length !== nextKeys.length) {
 return false;
 }
 if (
 prevKeys.some(
 // @ts-expect-error - key is a string
 (key) => prevProps.components?.[key] !== nextProps.components?.[key]
 )
 ) {
 return false;
 }
 }

 // Check if rehypePlugins changed (reference comparison)
 if (prevProps.rehypePlugins !== nextProps.rehypePlugins) {
 return false;
 }

 // Check if remarkPlugins changed (reference comparison)
 if (prevProps.remarkPlugins !== nextProps.remarkPlugins) {
 return false;
 }

 return true;
 }
);

Block.displayName = 'Block';

const defaultShikiTheme: [BundledTheme, BundledTheme] = [
 'github-light',
 'github-dark',
];

export const Streamdown = memo(
 ({
 children,
 mode = 'streaming',
 parseIncompleteMarkdown: shouldParseIncompleteMarkdown = true,
 components,
 rehypePlugins = defaultRehypePluginsArray,
 remarkPlugins = defaultRemarkPluginsArray,
 className,
 shikiTheme = defaultShikiTheme,
 mermaid,
 controls = true,
 isAnimating = false,
 BlockComponent = Block,
 parseMarkdownIntoBlocksFn = parseMarkdownIntoBlocks,
 caret,
 cdnUrl,
 remend: remendOptions,
 ...props
 }: StreamdownProps) => {
 // All hooks must be called before any conditional returns
 const generatedId = useId();
 const [_isPending, startTransition] = useTransition();
 const [displayBlocks, setDisplayBlocks] = useState<string[]>([]);

 // Apply remend to fix incomplete markdown BEFORE parsing into blocks
 // This prevents partial list items from being interpreted as setext headings
 const processedChildren = useMemo(() => {
 if (typeof children !== 'string') {
 return '';
 }
 return mode === 'streaming' && shouldParseIncompleteMarkdown
 ? //@ts-ignore
 remend(children, remendOptions)
 : children;
 }, [children, mode, shouldParseIncompleteMarkdown, remendOptions]);

 const blocks = useMemo(
 () => parseMarkdownIntoBlocksFn(processedChildren),
 [processedChildren, parseMarkdownIntoBlocksFn]
 );

 // Use transition for block updates in streaming mode to avoid blocking UI
 useEffect(() => {
 if (mode === 'streaming') {
 startTransition(() => {
 setDisplayBlocks(blocks);
 });
 } else {
 setDisplayBlocks(blocks);
 }
 }, [blocks, mode]);

 // Use displayBlocks for rendering to leverage useTransition
 const blocksToRender = mode === 'streaming' ? displayBlocks : blocks;

 // Generate stable keys based on index only
 // Don't use content hash - that causes unmount/remount when content changes
 // React will handle content updates via props changes and memo comparison
 // biome-ignore lint/correctness/useExhaustiveDependencies: "we're using the blocksToRender length"
 const blockKeys = useMemo(
 () => blocksToRender.map((_block, idx) => `${generatedId}-${idx}`),
 [blocksToRender.length, generatedId]
 );

 // Combined context value - single object reduces React tree overhead
 const contextValue = useMemo<StreamdownContextType>(
 () => ({
 shikiTheme,
 controls,
 isAnimating,
 mode,
 mermaid,
 cdnUrl,
 }),
 [shikiTheme, controls, isAnimating, mode, mermaid, cdnUrl]
 );

 // Memoize merged components to avoid recreating on every render
 const mergedComponents = useMemo(
 () => ({
 ...defaultComponents,
 ...components,
 }),
 [components]
 );

 const style = useMemo(
 () =>
 caret && isAnimating
 ? ({
 '--streamdown-caret': `"${carets[caret]}"`,
 } as CSSProperties)
 : undefined,
 [caret, isAnimating]
 );

 // Static mode: simple rendering without streaming features
 if (mode === 'static') {
 return (
 <StreamdownContext.Provider value={contextValue}>
 <div
 className={cn(
 'space-y-4 whitespace-normal *:first:mt-0 *:last:mb-0',
 className
 )}
 >
 <Markdown
 components={mergedComponents}
 rehypePlugins={rehypePlugins}
 remarkPlugins={remarkPlugins}
 {...props}
 >
 {children}
 </Markdown>
 </div>
 </StreamdownContext.Provider>
 );
 }

 // Streaming mode: parse into blocks with memoization and incomplete markdown handling
 return (
 <StreamdownContext.Provider value={contextValue}>
 <div
 className={cn(
 'space-y-4 whitespace-normal *:first:mt-0 *:last:mb-0',
 caret
 ? '*:last:after:inline *:last:after:align-baseline *:last:after:content-(--streamdown-caret)'
 : null,
 className
 )}
 style={style}
 >
 {blocksToRender.map((block, index) => (
 <BlockComponent
 components={mergedComponents}
 content={block}
 index={index}
 key={blockKeys[index]}
 rehypePlugins={rehypePlugins}
 remarkPlugins={remarkPlugins}
 shouldParseIncompleteMarkdown={shouldParseIncompleteMarkdown}
 {...props}
 />
 ))}
 </div>
 </StreamdownContext.Provider>
 );
 },
 (prevProps, nextProps) =>
 prevProps.children === nextProps.children &&
 prevProps.shikiTheme === nextProps.shikiTheme &&
 prevProps.isAnimating === nextProps.isAnimating &&
 prevProps.mode === nextProps.mode
);
Streamdown.displayName = 'Streamdown';
