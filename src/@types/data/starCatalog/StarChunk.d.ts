import type { OctreeNodeTable } from '../../octree/OctreeNodeTable';
import type { StarColumns } from './StarColumns';

/** One decoded chunk object: the rows strictly below its root, object-local `firstRecord`. */
export type StarChunk = {
  /** Index into `StarOctree.chunks`. */
  readonly ref: number;
  readonly nodes: OctreeNodeTable;
  readonly records: StarColumns;
};
