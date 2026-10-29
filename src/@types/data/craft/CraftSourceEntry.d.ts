import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Craft-typed row of the SOURCE_REGISTRY — the missions Layer's one row for every craft. Not a
 * body: a craft is the `craft` selection kind, and the row's label item mutes every craft caption.
 */
export type CraftSourceEntry = SourceEntryBase & {
  readonly type: 'craft';
  /** Stable numeric tag; not persisted, packed into the pick texture. */
  readonly code: number;
};
