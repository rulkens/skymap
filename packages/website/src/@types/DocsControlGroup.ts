import type { DocsControl } from './DocsControl';

/** One table of the Controls page. `kind` says whether `input` is keys or a gesture in words. */
export type DocsControlGroup = {
  id: string;
  kind: 'keys' | 'gesture';
  rows: readonly DocsControl[];
};
