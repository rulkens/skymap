import type { ColumnId } from './ColumnId';
import type { OctreeChunkRef } from './OctreeChunkRef';
import type { OctreeColumn } from './OctreeColumn';

/** What a family hands the shared chunk stream: where its chunks live and how its records decode. */
export type OctreeStreamFormat<C> = {
  chunkPath(ref: Pick<OctreeChunkRef, 'level' | 'morton' | 'hash'>): string;
  decodeRecords(columns: ReadonlyMap<ColumnId, OctreeColumn>, count: number): C;
};
