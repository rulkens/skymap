import type { GalaxyCatalogSourceEntry } from './GalaxyCatalogSourceEntry';
import type { StructureSourceEntry } from './StructureSourceEntry';
import type { FilamentSourceEntry } from './FilamentSourceEntry';
import type { VolumeSourceEntry } from './VolumeSourceEntry';

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
