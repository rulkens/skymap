import type { PagefindApi } from './PagefindApi';

/** The search dialog with the loader its own inline script hangs on it (components/DocsSearch.astro). */
export type SearchSheet = HTMLDialogElement & { loadIndex(): Promise<PagefindApi> };
