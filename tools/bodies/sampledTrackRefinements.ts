/**
 * SAMPLED_TRACK_REFINEMENTS — per-body steps `buildSampledTracks` runs on the merged raw samples
 * before decimation, keyed by `HORIZONS_BODIES` id. A body without an entry is decimated as fetched.
 */
import type { SampledTrack } from '../../src/@types/scene/SampledTrack';
import type { HorizonsBody } from './@types/HorizonsBody';
import { blendVoyagerEncounters } from './blendVoyagerEncounters';

export const SAMPLED_TRACK_REFINEMENTS: Readonly<
  Record<string, (track: SampledTrack, row: HorizonsBody) => void>
> = {
  voyager1: blendVoyagerEncounters,
  voyager2: blendVoyagerEncounters,
};
