import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Black-hole-typed row of the SOURCE_REGISTRY — a supermassive black hole the
 * blackHoles Layer owns end to end. Not a body: it has no surface, so none of
 * the body tables (seeds, picks, settings items) key on it. The display names
 * are required because the card, caption and palette all read them.
 */
export type BlackHoleSourceEntry = SourceEntryBase & {
  readonly type: 'blackHole';
  /** Stable numeric tag; not persisted, only used as the registry key. */
  readonly code: number;
  readonly id: string;
  readonly label: string;
  readonly detailLabel: string;
  readonly shortLabel: string;
  readonly plural: string;
};
