/**
 * An octree pool's size past the index: `slots` chunk slots of `chunkNodeCap` rows each, and
 * `records` records cut into variable runs, `maxRun` (a power of two) the largest.
 */
export type OctreePoolShape = {
  readonly slots: number;
  readonly records: number;
  readonly maxRun: number;
};
