import type { SurveySourceEntry } from './SurveySourceEntry';
import type { PoiSourceEntry } from './PoiSourceEntry';
import type { FilamentSourceEntry } from './FilamentSourceEntry';
import type { VolumeSourceEntry } from './VolumeSourceEntry';

/**
 * One row of the SOURCE_REGISTRY — discriminated by the `type` field
 * across four kinds: per-point galaxy surveys, marker-ring POIs, the
 * filament skeleton, and scalar-volume cubes.
 */
export type SourceEntry =
  | SurveySourceEntry
  | PoiSourceEntry
  | FilamentSourceEntry
  | VolumeSourceEntry;
