/** One chunk object as its parent object's header names it; its root rows live in that parent. */
export type OctreeChunkRef = {
  /** Catalog-global chunk id, 0 … `chunkCount − 1`: what a row's `chunkRef` holds. */
  readonly id: number;
  /** The first root's level and Morton key: with the hash, the object's file name. */
  readonly level: number;
  readonly morton: number;
  /** Rows of the parent object (the one listing this ref) that root the chunk, in Morton order. */
  readonly roots: readonly number[];
  /** `contentHash8` of the encoded object, part of its file name. */
  readonly hash: string;
  /** Raw (uncompressed) object size, a wire-size hint. */
  readonly bytes: number;
  readonly nodes: number;
  readonly records: number;
  /** Catalog-global record ordinal of the chunk's first record. */
  readonly recordBase: number;
};
