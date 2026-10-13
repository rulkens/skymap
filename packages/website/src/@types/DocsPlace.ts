import type { DocsGroup } from './DocsGroup';
import type { DocsPage } from './DocsPage';

/** Where a docs page stands in the tree: its row, its group, and the written pages before and after it in that group. */
export type DocsPlace = {
  group: DocsGroup;
  page: DocsPage;
  previous?: DocsPage;
  next?: DocsPage;
};
