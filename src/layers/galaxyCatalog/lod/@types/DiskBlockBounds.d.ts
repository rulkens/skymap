/** A galaxy block's reach for the disk walk: its galaxies' bounding box (Mpc) and largest diameter. */
export type DiskBlockBounds = {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
  readonly maxDiameterKpc: number;
};
