import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Milky-Way-typed row of the SOURCE_REGISTRY — the procedural galactic-disk
 * overlay drawn by `milkyWayRenderer`.
 *
 * The row is label-bearing (bearsLabel:true, labelLayer:'milkyWay'), carrying
 * the "You are here" label through the standard label machinery rather than a
 * bespoke marker path.
 *
 * No on-disk asset (generated procedurally) and no per-record identity, so it
 * adds only `code` to the base.
 */
export type MilkyWaySourceEntry = SourceEntryBase & {
  readonly type: 'milkyWay';
  /** Stable numeric tag; not persisted, only used as the registry key. */
  readonly code: number;
};
