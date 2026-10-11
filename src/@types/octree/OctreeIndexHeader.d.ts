import type { ColumnSchema } from './ColumnSchema';
import type { OctreeChunkRef } from './OctreeChunkRef';
import type { OctreeFamily } from './OctreeFamily';
import type { OctreeGrid } from './OctreeGrid';
import type { OctreeStratify } from './OctreeStratify';
import type { StatId } from './StatId';

/** The index object's JSON header: the catalog's facts, and the refs of the chunks rooted in its rows. */
export type OctreeIndexHeader = {
  readonly kind: 'index';
  readonly family: OctreeFamily;
  readonly grid: OctreeGrid;
  readonly stratify: OctreeStratify;
  /** Max records in one chunk object. */
  readonly chunkCapacity: number;
  /** Max node rows in one chunk object: the pool's row stride. */
  readonly chunkNodeCap: number;
  /** This object's own node and record counts. */
  readonly nodes: number;
  readonly records: number;
  readonly columns: readonly ColumnSchema[];
  readonly stats: Readonly<Partial<Record<StatId, number>>>;
  /** Only the chunks rooted in index rows; each chunk's header lists its own. */
  readonly chunks: readonly OctreeChunkRef[];
};
