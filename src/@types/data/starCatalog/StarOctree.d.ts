import type { ColumnSchema } from '../../octree/ColumnSchema';
import type { OctreeChunkRef } from '../../octree/OctreeChunkRef';
import type { OctreeGrid } from '../../octree/OctreeGrid';
import type { OctreeNodeTable } from '../../octree/OctreeNodeTable';
import type { StarColumns } from './StarColumns';

/**
 * What both star formats decode to and the renderer, planner and pick read: the index's
 * node table and records plus the refs of the chunks it roots. A SKST v1 catalog is an index with every
 * row and no chunks (`starOctreeFromSkst`).
 */
export type StarOctree = {
  /** Grid unit is parsecs. */
  readonly grid: OctreeGrid;
  /** Real (non-blob) records across the whole catalog, chunks included. */
  readonly starCount: number;
  /** `STAR_COLUMN_SCHEMA` for both formats; a chunk decodes against it. */
  readonly columns: readonly ColumnSchema[];
  /** Index rows (every row for SKST); the root is the last row. */
  readonly nodes: OctreeNodeTable;
  /** The index object's records. */
  readonly records: StarColumns;
  /** The chunks rooted in index rows; deeper ones are learnt as their parents decode. [] for SKST. */
  readonly chunks: readonly OctreeChunkRef[];
  /** Chunks at every depth, so per-chunk tables size once; 0 for SKST. */
  readonly chunkCount: number;
  /** Max records in one chunk (the pool's record stride); 0 for SKST. */
  readonly chunkCapacity: number;
  /** Max rows in one chunk (the pool's row stride); 0 for SKST. */
  readonly chunkNodeCap: number;
};
