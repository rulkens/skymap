import type { DocsPage } from './DocsPage';

/**
 * One row of data/docsTree.ts. `title` is set only where no text in
 * content/docs holds one (a page made from data), and `job` only on those
 * same rows: a text carries its job in its own front matter.
 */
export type DocsRow = Omit<DocsPage, 'title'> & { title?: string; job?: string };
