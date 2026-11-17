import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Milky-Way-typed row of the APP_SOURCE_REGISTRY — the GPU-generated star/dust
 * point-cloud overlay drawn by `milkyWayCloudRenderer`.
 *
 * The row is label-bearing (bearsLabel:true), carrying
 * the "You are here" label through the standard label machinery rather than a
 * bespoke marker path.
 *
 * No on-disk asset (generated procedurally) and no per-record identity, so it
 * adds nothing to the base.
 */
export type MilkyWaySourceEntry = SourceEntryBase & {
  readonly type: 'milkyWay';
};
