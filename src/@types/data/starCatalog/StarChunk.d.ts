import type { OctreeChunkRef } from '../../octree/OctreeChunkRef';
import type { OctreeNodeTable } from '../../octree/OctreeNodeTable';
import type { StarColumns } from './StarColumns';

/** One decoded chunk object: the rows strictly below its roots, object-local `firstRecord`. */
export type StarChunk = {
  /** Its entry in its parent's header: id, roots (parent rows), record base. */
  readonly ref: OctreeChunkRef;
  /** The id of the chunk whose rows hold its roots; null when the index holds them. */
  readonly parent: number | null;
  readonly nodes: OctreeNodeTable;
  readonly records: StarColumns;
};
