// Relative, so a tiny positive count still rounds up to 8: far below any real size
// difference, far above the dust `dims × voxelSizeMpc / voxelSizeMpc` leaves
// (24 × 0.1 / 0.1 = 24.000000000000004).
const RELATIVE_DUST = 1e-10;

/**
 * ceil8 — a voxel count rounded up to whole 8-voxel blocks: the decay kernel
 * dispatches dims/8 with no bounds tail (encodeStep.ts). Float dust above a
 * whole block is not a block more, or a block-aligned size would grow by 8.
 */
export function ceil8(voxels: number): number {
  return Math.ceil((voxels * (1 - RELATIVE_DUST)) / 8) * 8;
}
