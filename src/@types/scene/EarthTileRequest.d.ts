import type { EarthTileId } from '../data/EarthTileId';

/**
 * EarthTileRequest — one tile the planner wants resident this frame, with
 * how badly (`screenPx`, its on-screen extent in pixels — doubles as fetch
 * priority so the two never drift apart). Feeds `PriorityQueue`'s
 * largest-first pop with no negation, like the galaxy thumbnail queue.
 */
export type EarthTileRequest = {
  readonly tile: EarthTileId;
  /** Projected on-screen extent, in pixels — doubles as fetch priority. */
  readonly screenPx: number;
};
