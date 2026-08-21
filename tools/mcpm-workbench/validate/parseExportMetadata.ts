import type { Vec3 } from '../../../src/@types/math/Vec3';

/**
 * parseExportMetadata — pull dims/origin/voxel-size/point-count out of the
 * MCPM VAC's `export_metadata.txt`. Field format confirmed against the real
 * upstream file (SDSS_z_44-476mpc, curl'd directly — never the 2.3 GB
 * `trace.bin` alongside it):
 *
 *   number of data points: 324849
 *   simulation grid resolution: 712 x 1200 x 728 [vox]
 *   simulation grid size: 556.288 x 937.564 x 568.789 [mpc]
 *   simulation grid center: (-239.469, -16.5618, 201.275) [mpc]
 *
 * origin is the lower corner of voxel (0,0,0): center - size/2, matching
 * worldToVoxel.ts's convention.
 */
export function parseExportMetadata(text: string): {
  dims: Vec3;
  originMpc: Vec3;
  voxelSizeMpc: Vec3;
  dataPointCount: number;
} {
  const countMatch = text.match(/number of data points:\s*(\d+)/i);
  const resMatch = text.match(/grid resolution:\s*(\d+)\s*x\s*(\d+)\s*x\s*(\d+)/i);
  const sizeMatch = text.match(/grid size:\s*([\d.+-]+)\s*x\s*([\d.+-]+)\s*x\s*([\d.+-]+)/i);
  const centerMatch = text.match(/grid center:\s*\(([^,]+),([^,]+),([^)]+)\)/i);
  if (!countMatch || !resMatch || !sizeMatch || !centerMatch) {
    throw new Error(
      'parseExportMetadata: could not find "number of data points" / "grid resolution" / ' +
        '"grid size" / "grid center" lines in the expected export_metadata.txt format',
    );
  }
  const dims: Vec3 = [Number(resMatch[1]), Number(resMatch[2]), Number(resMatch[3])];
  const sizeMpc: Vec3 = [Number(sizeMatch[1]), Number(sizeMatch[2]), Number(sizeMatch[3])];
  const centerMpc: Vec3 = [Number(centerMatch[1]), Number(centerMatch[2]), Number(centerMatch[3])];
  const voxelSizeMpc: Vec3 = [sizeMpc[0] / dims[0], sizeMpc[1] / dims[1], sizeMpc[2] / dims[2]];
  const originMpc: Vec3 = [
    centerMpc[0] - sizeMpc[0] / 2,
    centerMpc[1] - sizeMpc[1] / 2,
    centerMpc[2] - sizeMpc[2] / 2,
  ];
  return { dims, originMpc, voxelSizeMpc, dataPointCount: Number(countMatch[1]) };
}
