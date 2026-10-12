import type { DocsCommand } from './DocsCommand';

/** The commands of one task, under one heading of the Command-line tools page; `id` is the heading's anchor. */
export type DocsCommandGroup = {
  id: string;
  title: string;
  rows: readonly DocsCommand[];
};
