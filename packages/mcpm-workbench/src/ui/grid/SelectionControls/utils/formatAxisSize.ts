import { formatSizeMpc } from '../../../../utils/format/formatSizeMpc';

/**
 * formatAxisSize — a size slider's value: the axis extent and its voxel count
 * as one fact, so "204 Mpc" is never read apart from the 272 voxels it is.
 */
export function formatAxisSize(sizeMpc: number, voxels: number): string {
  return `${formatSizeMpc(sizeMpc)} Mpc · ${voxels} vox`;
}
