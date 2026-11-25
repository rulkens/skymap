const TWO_DECIMALS_BELOW_MPC = 10;
const ONE_DECIMAL_BELOW_MPC = 100;

/**
 * formatVoxelSizeMpc — the voxel-size pill: three significant figures from 1 Mpc
 * up, so each log-step press (×1.023) still moves the readout at every size.
 */
export function formatVoxelSizeMpc(voxelSizeMpc: number): string {
  const decimals =
    voxelSizeMpc < TWO_DECIMALS_BELOW_MPC ? 2 : voxelSizeMpc < ONE_DECIMAL_BELOW_MPC ? 1 : 0;
  return `${voxelSizeMpc.toFixed(decimals)} Mpc`;
}
