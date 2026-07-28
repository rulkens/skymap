import type { EarthTileId } from '../data/EarthTileId';

/**
 * EarthTileRequest — one tile the planner wants resident this frame, with the
 * measure of how badly.
 *
 * `screenPx` is the tile patch's projected on-screen extent in pixels, and it
 * does double duty: the planner compares it against the tile edge to decide
 * whether to refine, and the fetch queue takes it verbatim as the fetch
 * priority. Those are the same question ("how much of the screen does this
 * cover?") asked twice, so deriving a separate priority from it would be two
 * numbers that must agree and eventually would not.
 *
 * It feeds `PriorityQueue`'s natural largest-first pop with no negation, which
 * matches the galaxy thumbnail queue's reading of priority rather than the asset
 * queue's.
 */
export type EarthTileRequest = {
  readonly tile: EarthTileId;
  /** Projected on-screen extent of the tile patch, in pixels. Doubles as the
   *  fetch priority. */
  readonly screenPx: number;
};
