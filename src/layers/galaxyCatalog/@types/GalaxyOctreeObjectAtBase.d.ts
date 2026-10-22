import type { GalaxyOctreeObject } from '../../../@types/data/galaxyCatalog/GalaxyOctreeObject';

/** A galaxy octree object with the ordinal of its first record. */
export type GalaxyOctreeObjectAtBase = {
  readonly object: GalaxyOctreeObject;
  readonly base: number;
};
