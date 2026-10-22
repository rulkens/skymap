import type { GalaxyCatalog } from './GalaxyCatalog';

/**
 * The resident columns the disk walk, its visitors and structure membership
 * read: a flat source hands its whole catalog as one block, a chunked source
 * one block per resident chunk. `medianAbsMag` is the source's stat, not the block's.
 */
export type GalaxyColumnBlock = Pick<
  GalaxyCatalog,
  | 'count'
  | 'positions'
  | 'diameterKpc'
  | 'axisRatio'
  | 'positionAngleDeg'
  | 'magU'
  | 'magG'
  | 'magR'
  | 'magI'
  | 'magZ'
>;
