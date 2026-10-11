/** One chunk object as the index's manifest names it; its root rows live in the index. */
export type OctreeChunkRef = {
  /** The first root's level and Morton key: with the hash, the object's file name. */
  readonly level: number;
  readonly morton: number;
  /** Index rows of the chunk's roots, in Morton order; each names this chunk in its `chunkRef`. */
  readonly roots: readonly number[];
  /** `contentHash8` of the encoded object, part of its file name. */
  readonly hash: string;
  /** Raw (uncompressed) object size, a wire-size hint. */
  readonly bytes: number;
  readonly nodes: number;
  readonly records: number;
};
