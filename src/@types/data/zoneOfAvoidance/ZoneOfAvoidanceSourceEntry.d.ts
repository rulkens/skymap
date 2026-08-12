import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Zone-of-avoidance-typed row of the SOURCE_REGISTRY — the additively-blended
 * guide band drawn along the galactic plane, annotating the dust-obscured
 * hole shared by every optical/near-IR galaxy catalog.
 *
 * The row is label-bearing (bearsLabel:true, labelLayer:'zoneOfAvoidance'),
 * carrying the curved "ZONE OF AVOIDANCE" lettering through the standard
 * label machinery rather than a bespoke marker path.
 *
 * No on-disk asset (the band is a closed-form b_limit(ℓ) shell) and no
 * per-record identity, so it adds only `code` to the base — mirrors
 * `MilkyWaySourceEntry`.
 */
export type ZoneOfAvoidanceSourceEntry = SourceEntryBase & {
  readonly type: 'zoneOfAvoidance';
  /** Stable numeric tag; not persisted, only used as the registry key. */
  readonly code: number;
};
