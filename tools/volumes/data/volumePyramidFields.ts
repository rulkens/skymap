import type { VolumePyramidFieldRow } from '../../@types/volumes/VolumePyramidFieldRow';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { MCPM_ENTRY } from '../../../src/layers/cosmicWebDensity/sources/mcpm';
import { POLYPHORM_2MRS_ENTRY } from '../../../src/layers/cosmicWebDensity/sources/polyphorm-2mrs';

// Grid constants from each export's export_metadata.txt (resolution, size, centre).
const MCPM_GRID: Vec3 = [712, 1200, 728];
const MCPM_VOXEL_MPC = 0.78131; // 556.288 Mpc / 712
const MCPM_CENTRE_MPC: Vec3 = [-239.469, -16.5618, 201.275];

const TWOMRS_GRID: Vec3 = [1200, 752, 960];
const TWOMRS_SIZE_MPC: Vec3 = [1469.05, 920.605, 1175.24];
const TWOMRS_CENTRE_MPC: Vec3 = [21.2736, 21.0657, 36.8793];

/** Keyed by the builder's CLI argument. Boxes obey the crop rule (spec §4); the builder checks. */
export const VOLUME_PYRAMID_FIELDS: Readonly<
  Record<'mcpm' | 'polyphorm-2mrs', VolumePyramidFieldRow>
> = {
  mcpm: {
    id: MCPM_ENTRY.binBaseName,
    npy: { dir: 'mcpm.dir', stem: 'mcpm_sdss' },
    nativePeak: 134143.296875,
    gridDims: MCPM_GRID,
    voxelMpc: MCPM_VOXEL_MPC,
    originMpc: [0, 1, 2].map(
      (a) => MCPM_CENTRE_MPC[a]! - 0.5 * MCPM_GRID[a]! * MCPM_VOXEL_MPC,
    ) as Vec3,
    frame: 'equatorial-cartesian',
    dataBox: { originVox: [40, 40, 40], dims: [672, 1152, 648] },
    zeroBelowRaw: 0,
  },
  'polyphorm-2mrs': {
    id: POLYPHORM_2MRS_ENTRY.binBaseName,
    npy: { dir: 'polyphorm.dir', stem: 'polyphorm_2mrs' },
    nativePeak: 11272,
    gridDims: TWOMRS_GRID,
    // The per-axis edges differ in the seventh digit; one cubic voxel, as the old import collapsed them.
    voxelMpc:
      (TWOMRS_SIZE_MPC[0] / TWOMRS_GRID[0] +
        TWOMRS_SIZE_MPC[1] / TWOMRS_GRID[1] +
        TWOMRS_SIZE_MPC[2] / TWOMRS_GRID[2]) /
      3,
    originMpc: [0, 1, 2].map((a) => TWOMRS_CENTRE_MPC[a]! - 0.5 * TWOMRS_SIZE_MPC[a]!) as Vec3,
    frame: 'equatorial-cartesian',
    dataBox: { originVox: [352, 120, 208], dims: [480, 480, 464] },
    // The old `--clamp 0.2` on the d2 tier, whose log scale was its own peak 6090, as a raw value.
    zeroBelowRaw: Math.expm1(0.2 * Math.log1p(6090)),
  },
};
