import type { ColumnId } from './ColumnId';
import type { OctreeChunkHeader } from './OctreeChunkHeader';
import type { OctreeColumn } from './OctreeColumn';
import type { OctreeIndexHeader } from './OctreeIndexHeader';
import type { OctreeNodeTable } from './OctreeNodeTable';

/** One decoded index or chunk object: its header, node table and one typed array per column. */
export type DecodedOctreeObject<H extends OctreeIndexHeader | OctreeChunkHeader> = {
  readonly header: H;
  readonly nodes: OctreeNodeTable;
  readonly columns: ReadonlyMap<ColumnId, OctreeColumn>;
};
