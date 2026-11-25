/** A step `buildSampledTracks` runs on a body's merged raw samples, in place, before decimation. */
import type { SampledTrack } from '../../../src/@types/scene/SampledTrack';
import type { HorizonsBody } from './HorizonsBody';

export type SampledTrackRefinement = (track: SampledTrack, row: HorizonsBody) => void;
