import type { HeightPyramid } from './HeightPyramid';

/** LazyHeightPyramid — a `HeightPyramid` whose reads are synchronous but whose tile decode
 *  (sharp, async) is not: a read that hits an undecoded tile returns 0 and records a miss.
 *  A result is valid only after a pass that leaves no misses (`bakeHorizonTileResolved`). */
export type LazyHeightPyramid = HeightPyramid & {
  /** Decodes every tile a read missed since the last call; resolves to how many. */
  loadMisses(): Promise<number>;
  /** Drops every decoded tile once more than `maxTiles` are held; call between tiles only. */
  trim(maxTiles: number): void;
};
