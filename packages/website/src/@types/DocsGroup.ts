import type { DocsPage } from './DocsPage';

/** One group of the docs sidebar: `purpose` is its line on the docs index, `up` the landing page its pages link back to. */
export type DocsGroup = {
  name: string;
  purpose: string;
  up: string;
  pages: readonly DocsPage[];
};
