import type { ColumnId } from '../../../src/@types/octree/ColumnId';
import type { OctreeNodeTable } from '../../../src/@types/octree/OctreeNodeTable';

/** One chunk before encoding: the rows strictly below its roots, firstRecord object-local; columns as `StratifiedOctree`'s. */
export type OctreeChunkObject = {
  /** The first root's level and Morton key, which name the object. */
  readonly level: number;
  readonly morton: number;
  /** The id of the chunk whose rows hold this chunk's roots; null when the index holds them. */
  readonly parent: number | null;
  /** The parent object's rows that root this chunk, in Morton order. */
  readonly roots: readonly number[];
  /** Catalog-global ordinal of its first record. */
  readonly recordBase: number;
  readonly nodes: OctreeNodeTable;
  readonly columns: ReadonlyMap<ColumnId, Float32Array>;
};
