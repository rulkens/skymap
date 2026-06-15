import type { GalaxyCatalogSourceEntry } from './galaxyCatalog/GalaxyCatalogSourceEntry';
import type { StructureSourceEntry } from './structure/StructureSourceEntry';
import type { FilamentSourceEntry } from './filament/FilamentSourceEntry';
import type { VolumeSourceEntry } from './volume/VolumeSourceEntry';

/**
 * One row of the SOURCE_REGISTRY — discriminated by the `type` field
 * across four kinds: per-point galaxy catalogs, marker-ring structures, the
 * filament skeleton, and scalar-volume cubes.
 */
export type SourceEntry =
  | GalaxyCatalogSourceEntry
  | StructureSourceEntry
  | FilamentSourceEntry
  | VolumeSourceEntry;
