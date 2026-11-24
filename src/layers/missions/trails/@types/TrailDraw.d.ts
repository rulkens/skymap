import type { MissionTrailGeometry } from './MissionTrailGeometry';

/**
 * One `drawTrail` call: the first `segmentCount` segments of `piece`, and whether a head ends it.
 * `weight` scales its opacity (two pictures cross-fade while a craft leaves a planet). The line
 * fades to nothing toward vertex `fadeVertex` (-1: no fade), over at most `fadeMaxMpc`.
 */
export type TrailDraw = {
  readonly piece: MissionTrailGeometry;
  readonly segmentCount: number;
  readonly head: boolean; // end on the craft's live position
  readonly weight: number;
  readonly fadeVertex: number;
  readonly fadeMaxMpc: number;
};
