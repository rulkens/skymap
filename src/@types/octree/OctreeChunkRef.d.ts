/** One chunk object as the index's manifest names it; its root row lives in the index. */
export type OctreeChunkRef = {
  /** The chunk root's level and Morton key. */
  readonly level: number;
  readonly morton: number;
  /** `contentHash8` of the encoded object, part of its file name. */
  readonly hash: string;
  /** Raw (uncompressed) object size, a wire-size hint. */
  readonly bytes: number;
  readonly nodes: number;
  readonly records: number;
};
