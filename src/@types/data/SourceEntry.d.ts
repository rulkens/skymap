import type { GalaxyCatalogSourceEntry } from './galaxyCatalog/GalaxyCatalogSourceEntry';
import type { StructureSourceEntry } from './structure/StructureSourceEntry';
import type { FilamentSourceEntry } from './filament/FilamentSourceEntry';
import type { VolumeSourceEntry } from './volume/VolumeSourceEntry';
import type { MilkyWaySourceEntry } from './milkyWay/MilkyWaySourceEntry';
import type { FlowSourceEntry } from './flow/FlowSourceEntry';

/**
 * One row of the SOURCE_REGISTRY — discriminated by the `type` field
 * across six kinds: per-point galaxy catalogs, marker-ring structures, the
 * filament skeleton, scalar-volume cubes, the Milky-Way disk overlay, and
 * the peculiar-velocity flow field.
 */
export type SourceEntry =
  | GalaxyCatalogSourceEntry
  | StructureSourceEntry
  | FilamentSourceEntry
  | VolumeSourceEntry
  | MilkyWaySourceEntry
  | FlowSourceEntry;
