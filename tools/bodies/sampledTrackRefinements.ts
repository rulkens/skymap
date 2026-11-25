/**
 * SAMPLED_TRACK_REFINEMENTS — per-body refinements `buildSampledTracks` runs before decimation,
 * keyed by `HORIZONS_BODIES` id. A body without an entry is decimated as fetched.
 */
import type { SampledTrackRefinement } from './@types/SampledTrackRefinement';
import { blendVoyagerEncounters } from './blendVoyagerEncounters';

export const SAMPLED_TRACK_REFINEMENTS: Readonly<Record<string, SampledTrackRefinement>> = {
  voyager1: blendVoyagerEncounters,
  voyager2: blendVoyagerEncounters,
};
