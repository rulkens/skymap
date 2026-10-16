import type { ColumnId } from '../../../src/@types/octree/ColumnId';
import type { OctreeNodeTable } from '../../../src/@types/octree/OctreeNodeTable';

/** Catalog-wide node table (firstRecord catalog-global, chunkRef all NO_CHUNK_REF) plus record columns in node-row order, own records then blob. */
export type StratifiedOctree = {
  readonly nodes: OctreeNodeTable;
  /** `offset` is the fraction of the owning node's box, 3 per record, in [0, 1). */
  readonly columns: ReadonlyMap<ColumnId, Float32Array>;
  /** 8 rows per node, by octant; −1 where the child is absent. */
  readonly childIndex: Int32Array;
};
