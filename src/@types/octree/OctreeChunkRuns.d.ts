/** Where a chunk's two runs start, counted from the pool's first chunk record and chunk row. */
export type OctreeChunkRuns = {
  readonly records: number;
  readonly nodes: number;
};
