import type { GalaxyCatalogSourceEntry } from './galaxyCatalog/GalaxyCatalogSourceEntry';
import type { StructureSourceEntry } from './structure/StructureSourceEntry';
import type { FilamentSourceEntry } from './filament/FilamentSourceEntry';
import type { ConstellationsSourceEntry } from './constellations/ConstellationsSourceEntry';
import type { VolumeSourceEntry } from './volume/VolumeSourceEntry';
import type { MilkyWaySourceEntry } from './milkyWay/MilkyWaySourceEntry';
import type { FlowSourceEntry } from './flow/FlowSourceEntry';
import type { BodySourceEntry } from './body/BodySourceEntry';
import type { StarCatalogSourceEntry } from './starCatalog/StarCatalogSourceEntry';
import type { ZoneOfAvoidanceSourceEntry } from './zoneOfAvoidance/ZoneOfAvoidanceSourceEntry';

/**
 * One row of the SOURCE_REGISTRY — discriminated by the `type` field
 * across ten kinds: per-point galaxy catalogs, marker-ring structures, the
 * filament skeleton, the constellation figures, scalar-volume cubes, the
 * Milky-Way disk overlay, the peculiar-velocity flow field, star catalogs
 * (the survey-wide Gaia bin and the curated famous-star map), near-field
 * bodies (Earth, the Solar-System planets, the Sun), and the zone-of-avoidance
 * guide band.
 */
export type SourceEntry =
  | GalaxyCatalogSourceEntry
  | StructureSourceEntry
  | FilamentSourceEntry
  | ConstellationsSourceEntry
  | VolumeSourceEntry
  | MilkyWaySourceEntry
  | FlowSourceEntry
  | StarCatalogSourceEntry
  | BodySourceEntry
  | ZoneOfAvoidanceSourceEntry;
