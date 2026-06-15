import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Milky-Way-typed row of the SOURCE_REGISTRY — the procedural galactic-disk
 * overlay drawn by `milkyWayRenderer`.
 *
 * No on-disk asset (generated procedurally) and no per-record identity, so it
 * adds only `code` to the base; its sole user control is the `visible` master
 * toggle. (A future change may set `bearsLabel: true` once the "you are here"
 * marker is consolidated into the standard label machinery.)
 */
export type MilkyWaySourceEntry = SourceEntryBase & {
  readonly type: 'milkyWay';
  /** Stable numeric tag; not persisted, only used as the registry key. */
  readonly code: number;
};
