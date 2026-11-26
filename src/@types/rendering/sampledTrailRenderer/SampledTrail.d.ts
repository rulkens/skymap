import type { SampledTrailGeometry } from './SampledTrailGeometry';
import type { NearTrail } from './NearTrail';

/** One sampled body's trail: the whole track about the Sun, and a piece about each planet it stays near. */
export type SampledTrail = {
  readonly id: string;
  readonly whole: SampledTrailGeometry;
  readonly near: readonly NearTrail[]; // one per stay, in time order
};
