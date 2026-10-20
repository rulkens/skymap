import type { DocsPage } from './DocsPage';

/** One group of the docs sidebar: `purpose`, when set, is its line on the docs index; `up` the landing page its pages link back up to. `Page` is a row until its title is joined on. */
export type DocsGroup<Page = DocsPage> = {
  name: string;
  purpose?: string;
  up: string;
  pages: readonly Page[];
};
