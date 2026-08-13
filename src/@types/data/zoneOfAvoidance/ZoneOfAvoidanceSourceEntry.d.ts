import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Zone-of-avoidance-typed row of the SOURCE_REGISTRY — the additively-blended
 * guide band along the galactic plane, annotating the dust-obscured hole
 * shared by every optical/near-IR galaxy catalog. Label-bearing (curved
 * "Zone of Avoidance" lettering via `labelLayer`). No on-disk asset, no
 * per-record identity, so it adds only `code` to the base — mirrors
 * `MilkyWaySourceEntry`.
 */
export type ZoneOfAvoidanceSourceEntry = SourceEntryBase & {
  readonly type: 'zoneOfAvoidance';
  /** Stable numeric tag; not persisted, only used as the registry key. */
  readonly code: number;
};
