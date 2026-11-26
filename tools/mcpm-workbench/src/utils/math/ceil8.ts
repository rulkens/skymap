// Relative: far above the dust `dims × voxelSizeMpc / voxelSizeMpc` leaves
// (24 × 0.1 / 0.1 = 24.000000000000004), far below any real size difference.
const RELATIVE_DUST = 1e-10;

/** ceil8 — a voxel count rounded up to whole 8-voxel blocks (the decay kernel has no
 *  bounds tail); dust above a whole block is not a block more. */
export function ceil8(voxels: number): number {
  return Math.ceil((voxels * (1 - RELATIVE_DUST)) / 8) * 8;
}
