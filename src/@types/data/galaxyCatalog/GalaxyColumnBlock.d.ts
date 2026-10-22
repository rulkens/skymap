import type { GalaxyCatalog } from './GalaxyCatalog';

/**
 * The resident columns the disk walk, its visitors and structure membership
 * read: a flat source hands its whole catalog as one block, a chunked source
 * one block per resident chunk. `medianAbsMag` is the source's stat, not the block's.
 * A row with a NaN position is a chunked source's blob, not a galaxy: every reader skips it.
 */
export type GalaxyColumnBlock = Pick<
  GalaxyCatalog,
  'count' | 'positions' | 'diameterKpc' | 'axisRatio' | 'positionAngleDeg' | 'magG'
> & {
  /** Row `i`'s rest-frame colour ramp position (0..2): computed per ask for flat, baked for the octree. */
  colourIndexAt(i: number): number;
};
