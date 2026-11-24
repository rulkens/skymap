import type { MissionTrailGeometry } from './MissionTrailGeometry';

/** One craft's trail: the whole track about the Sun, and a piece about each planet it stays near. */
export type CraftTrail = {
  readonly id: string;
  readonly whole: MissionTrailGeometry;
  readonly near: readonly MissionTrailGeometry[]; // one per stay, in time order
};
