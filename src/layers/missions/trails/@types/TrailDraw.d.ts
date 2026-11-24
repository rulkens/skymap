import type { MissionTrailGeometry } from './MissionTrailGeometry';

/** One `drawTrail` call: the first `segmentCount` segments of `piece`, and whether a head ends it. */
export type TrailDraw = {
  readonly piece: MissionTrailGeometry;
  readonly segmentCount: number;
  readonly head: boolean; // end on the craft's live position
};
