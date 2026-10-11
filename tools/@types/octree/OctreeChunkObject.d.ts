import type { ColumnId } from '../../../src/@types/octree/ColumnId';
import type { OctreeNodeTable } from '../../../src/@types/octree/OctreeNodeTable';

/** One chunk before encoding: the rows strictly below its root (level, morton), firstRecord object-local; columns as `StratifiedOctree`'s. */
export type OctreeChunkObject = {
  readonly level: number;
  readonly morton: number;
  readonly nodes: OctreeNodeTable;
  readonly columns: ReadonlyMap<ColumnId, Float32Array>;
};
