import type { Vec3 } from '../math/Vec3';

/** The octree's quantisation grid, in the catalog unit (pc for stars). */
export type OctreeGrid = {
  /** Morton bits per axis; the root sits at level `bits`. */
  readonly bits: number;
  /** Min corner of the grid. */
  readonly origin: Vec3;
  /** Edge of a level-0 cell; a level-L box spans `cellEdge·2^L`. */
  readonly cellEdge: number;
};
