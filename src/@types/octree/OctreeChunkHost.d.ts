import type { OctreeNodeTable } from './OctreeNodeTable';

/** The object whose rows hold a chunk's roots, as the pool addresses it: the index, or a slot. */
export type OctreeChunkHost = {
  readonly nodes: OctreeNodeTable;
  /** Pool row of the object's row 0. */
  readonly nodeBase: number;
};
