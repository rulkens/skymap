import type { OctreeNodeTable } from '../../../@types/octree/OctreeNodeTable';

/** The object whose rows hold a chunk's roots, as the pool addresses it: the index, or a slot. */
export type StarChunkHost = {
  readonly nodes: OctreeNodeTable;
  /** Pool row of the object's row 0. */
  readonly nodeBase: number;
};
