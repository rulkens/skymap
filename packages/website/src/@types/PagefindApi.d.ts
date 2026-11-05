import type { PagefindPage } from './PagefindPage';

/** The part of Pagefind's browser module the search uses. A debounced search resolves to `null` when a later one replaced it. */
export type PagefindApi = {
  debouncedSearch(query: string): Promise<{ results: { data(): Promise<PagefindPage> }[] } | null>;
};
