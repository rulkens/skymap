import type { SampledTrailGeometry } from './SampledTrailGeometry';

/**
 * One `drawTrail` call: the first `segmentCount` segments of `piece`, and whether a head ends it.
 * `weight` scales its opacity: the Sun trail and a planet's piece cross-fade where they swap. The
 * line fades to nothing toward the piece's first vertex over at most `fadeMaxMpc` (0 = no fade).
 */
export type TrailDraw = {
  readonly piece: SampledTrailGeometry;
  readonly segmentCount: number;
  readonly head: boolean; // end on the body's live position
  readonly weight: number;
  readonly fadeMaxMpc: number;
};
