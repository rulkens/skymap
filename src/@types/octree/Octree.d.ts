import type { ColumnSchema } from './ColumnSchema';
import type { OctreeChunkRef } from './OctreeChunkRef';
import type { OctreeGrid } from './OctreeGrid';
import type { OctreeNodeTable } from './OctreeNodeTable';

/**
 * What every octree format decodes to and the renderer, planner and pick read: the index's
 * node table and records plus the refs of the chunks it roots. A SKST v1 catalog is an index
 * with every row and no chunks (`starOctreeFromSkst`).
 */
export type Octree<C extends { readonly count: number }> = {
  /** Grid unit is the family's (parsecs for stars). */
  readonly grid: OctreeGrid;
  /** Real (non-blob) records across the whole catalog, chunks included. */
  readonly recordCount: number;
  /** The family render schema; a chunk decodes against it. */
  readonly columns: readonly ColumnSchema[];
  /** Index rows (every row for SKST); the root is the last row. */
  readonly nodes: OctreeNodeTable;
  /** The index object's records. */
  readonly records: C;
  /** The chunks rooted in index rows (deeper ones are learnt as parents decode); [] for SKST. */
  readonly chunks: readonly OctreeChunkRef[];
  /** Chunks at every depth, so per-chunk tables size once; 0 for SKST. */
  readonly chunkCount: number;
  /** Max records in one chunk (the pool's record stride); 0 for SKST. */
  readonly chunkCapacity: number;
  /** Max rows in one chunk (the pool's row stride); 0 for SKST. */
  readonly chunkNodeCap: number;
};
