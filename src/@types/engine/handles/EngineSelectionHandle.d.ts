import type { PgcAliasMap } from '../../loading/PgcAliasMap';

/**
 * EngineSelectionHandle — selection data loader.
 *
 * Selection state (hover/select/focus) now lives entirely in the Redux
 * `selection` slice; callers dispatch `clearSelection` / `updateSelectionFocus`
 * / `updateSelectionSelect` directly. This handle exposes only the one piece
 * that cannot be a plain dispatch: the lazy PGC alias fetch, which triggers a
 * network request and returns a Promise.
 */
export type EngineSelectionHandle = {
  /** Lazy-load the PGC → human-name alias map (1.7 MB JSON). */
  loadAliases: () => Promise<PgcAliasMap>;
};
