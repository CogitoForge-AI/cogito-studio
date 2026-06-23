import 'katex/dist/katex.min.css';

import { useMemo } from 'react';
import rehypeKatex from 'rehype-katex';
import type { Pluggable } from 'unified';
import {
  Streamdown,
  defaultRehypePluginsArray,
  type StreamdownProps,
} from '@/ui/atoms/streamdown/lib/context';

const katexPlugin: Pluggable = [
  rehypeKatex,
  {
    errorColor: 'var(--color-muted-foreground)',
    strict: 'warn',
  },
];

export function LazyMathStreamdown(props: StreamdownProps) {
  const rehypePlugins = useMemo(
    () => [...defaultRehypePluginsArray, katexPlugin],
    []
  );

  return <Streamdown {...props} rehypePlugins={rehypePlugins} />;
}
