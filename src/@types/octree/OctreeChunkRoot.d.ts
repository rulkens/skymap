/** A landing chunk's root: its key (its top rows' parent keys) and its pool row in its host. */
export type OctreeChunkRoot = {
  readonly level: number;
  readonly morton: number;
  readonly rootRow: number;
};
