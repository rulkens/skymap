import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Black-hole-typed row of the APP_SOURCE_REGISTRY — a supermassive black hole the
 * blackHoles Layer owns end to end. Not a body: it has no surface, so none of
 * the body tables (seeds, picks, settings items) key on it.
 */
export type BlackHoleSourceEntry = SourceEntryBase & {
  readonly type: 'blackHole';
  readonly detailLabel: string;
};
