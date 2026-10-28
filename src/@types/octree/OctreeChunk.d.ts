import type { OctreeChunkRef } from './OctreeChunkRef';
import type { OctreeNodeTable } from './OctreeNodeTable';

/** One decoded chunk object: the rows strictly below its roots, object-local `firstRecord`. */
export type OctreeChunk<C extends { readonly count: number }> = {
  /** Its entry in its parent's header: id, roots (parent rows), record base. */
  readonly ref: OctreeChunkRef;
  /** The id of the chunk whose rows hold its roots; null when the index holds them. */
  readonly parent: number | null;
  readonly nodes: OctreeNodeTable;
  readonly records: C;
  /** The refs its header lists, rooted in its rows; most chunks list none. */
  readonly chunks: readonly OctreeChunkRef[];
};
