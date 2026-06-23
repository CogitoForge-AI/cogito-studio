import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { logger } from './logger';

/**
 * Converts Markdown content to formatted HTML string.
 * This is used for multi-format clipboard support (copying to Rich Text editors).
 */
async function markdownToHtml(markdown: string): Promise<string> {
  try {
    const { default: rehypeHighlight } = await import('rehype-highlight');

    const file = await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeHighlight)
      .use(rehypeStringify)
      .process(markdown);

    return String(file);
  } catch (error) {
    logger.error('Error converting markdown to html for clipboard:', error);
    return '';
  }
}

/**
 * Copies content to clipboard in multiple formats:
 * - text/plain: Raw Markdown content
 * - text/html: Rendered HTML content
 *
 * This allows the content to be pasted as Markdown in code editors
 * and as formatted Rich Text in applications like Google Docs, Word, or Slack.
 */
export async function copyMarkdownToClipboard(
  content: string
): Promise<boolean> {
  try {
    const html = await markdownToHtml(content);

    // Prepare multi-format clipboard data
    const clipboardData: Record<string, Blob> = {
      'text/plain': new Blob([content], { type: 'text/plain' }),
    };

    if (html) {
      // Wrap in a div to ensure it's treated as a block by some editors
      const wrappedHtml = `<div class="markdown-body">${html}</div>`;
      clipboardData['text/html'] = new Blob([wrappedHtml], {
        type: 'text/html',
      });
    }

    // Modern Clipboard API using ClipboardItem for multi-format support
    const item = new ClipboardItem(clipboardData);
    await navigator.clipboard.write([item]);

    return true;
  } catch (err) {
    logger.error('Failed to copy multi-format content to clipboard:', err);

    // Fallback if ClipboardItem is not supported or fails
    try {
      await navigator.clipboard.writeText(content);
      return true;
    } catch (fallbackErr) {
      logger.error('Clipboard fallback failed:', fallbackErr);
      return false;
    }
  }
}
