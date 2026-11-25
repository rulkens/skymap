/**
 * SAMPLED_TRACK_REFINEMENTS — per-body steps `buildSampledTracks` runs on the merged raw samples
 * before decimation, keyed by `HORIZONS_BODIES` id. A refined body needs its dense windows
 * (`<target>.dense.csv`, written by `denseFetch`); a body without an entry is decimated as fetched.
 */
import type { SampledTrack } from '../../src/@types/scene/SampledTrack';
import type { HorizonsBody } from './@types/HorizonsBody';
import { blendVoyagerEncounters } from './blendVoyagerEncounters';

const VOYAGER = {
  denseFetch: 'npm run fetch-voyager-windows',
  refine: blendVoyagerEncounters,
};

export const SAMPLED_TRACK_REFINEMENTS: Readonly<
  Record<string, { denseFetch: string; refine: (track: SampledTrack, row: HorizonsBody) => void }>
> = { voyager1: VOYAGER, voyager2: VOYAGER };
