import type { ColumnId } from '../../../src/@types/octree/ColumnId';
import type { OctreeNodeTable } from '../../../src/@types/octree/OctreeNodeTable';

/** One chunk before encoding: the rows strictly below its roots, firstRecord object-local; columns as `StratifiedOctree`'s. */
export type OctreeChunkObject = {
  /** The first root's level and Morton key, which name the object. */
  readonly level: number;
  readonly morton: number;
  /** Index rows of the chunk's roots, in Morton order. */
  readonly roots: readonly number[];
  readonly nodes: OctreeNodeTable;
  readonly columns: ReadonlyMap<ColumnId, Float32Array>;
};
