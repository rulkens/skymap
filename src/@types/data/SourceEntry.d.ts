import type { GalaxyCatalogSourceEntry } from './galaxyCatalog/GalaxyCatalogSourceEntry';
import type { StructureSourceEntry } from './structure/StructureSourceEntry';
import type { FilamentSourceEntry } from './filament/FilamentSourceEntry';
import type { VolumeSourceEntry } from './volume/VolumeSourceEntry';
import type { MilkyWaySourceEntry } from './milkyWay/MilkyWaySourceEntry';
import type { FlowSourceEntry } from './flow/FlowSourceEntry';
import type { FamousStarSourceEntry } from './body/FamousStarSourceEntry';
import type { PlanetSourceEntry } from './body/PlanetSourceEntry';
import type { EarthSourceEntry } from './body/EarthSourceEntry';
import type { StarCatalogSourceEntry } from './starCatalog/StarCatalogSourceEntry';

/**
 * One row of the SOURCE_REGISTRY — discriminated by the `type` field
 * across eight kinds: per-point galaxy catalogs, marker-ring structures, the
 * filament skeleton, scalar-volume cubes, the Milky-Way disk overlay, the
 * peculiar-velocity flow field, the survey-wide Gaia star catalog, and
 * near-field bodies (famous star, planet, Earth).
 */
export type SourceEntry =
  | GalaxyCatalogSourceEntry
  | StructureSourceEntry
  | FilamentSourceEntry
  | VolumeSourceEntry
  | MilkyWaySourceEntry
  | FlowSourceEntry
  | StarCatalogSourceEntry
  | FamousStarSourceEntry
  | PlanetSourceEntry
  | EarthSourceEntry;
