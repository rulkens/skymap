/**
 * formatSizeMpc — a built box size (dims × voxelSizeMpc) for its slider pill.
 * One decimal shows any 0.05-step voxel size's blocks exactly (8 × 0.05 = 0.4);
 * whole sizes drop the ".0" so 204 reads as the center sliders do.
 */
export function formatSizeMpc(sizeMpc: number): string {
  const tenths = Math.round(sizeMpc * 10);
  return (tenths / 10).toFixed(tenths % 10 === 0 ? 0 : 1);
}
