import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Zone-of-avoidance-typed row of the SOURCE_REGISTRY — the additively-blended
 * guide band along the galactic plane, annotating the dust-obscured hole
 * shared by every optical/near-IR galaxy catalog. NOT label-bearing: the
 * curved "Zone of Avoidance" lettering is drawn by `zoneOfAvoidanceLayer`
 * itself, riding the band's own toggle, rather than routing through the
 * label subsystem. No on-disk asset, no per-record identity, so it adds
 * only `code` to the base — mirrors `MilkyWaySourceEntry`.
 */
export type ZoneOfAvoidanceSourceEntry = SourceEntryBase & {
  readonly type: 'zoneOfAvoidance';
  /** Stable numeric tag; not persisted, only used as the registry key. */
  readonly code: number;
};
