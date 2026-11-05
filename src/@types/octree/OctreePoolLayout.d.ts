/** A record pool's shape: the index's records, then `slots` chunk slots of `chunkCapacity` records each. */
export type OctreePoolLayout = {
  readonly indexRecords: number;
  readonly chunkCapacity: number;
  readonly slots: number;
};
