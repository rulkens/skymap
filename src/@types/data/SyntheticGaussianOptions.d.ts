import type { ScalarFieldFrameKind } from './ScalarFieldFrameKind';

export type SyntheticGaussianOptions = {
  /** Cube edge length in voxels (cubic grid).  Default 64. */
  dims?: number;
  /** Frame the cube lives in.  Default `equatorial-cartesian`. */
  frameKind?: ScalarFieldFrameKind;
  /** Physical edge length of the cube in Mpc.  Default 400. */
  boxSizeMpc?: number;
  /** Standard deviation of the Gaussian, in voxels.  Default dims/6. */
  sigmaVoxels?: number;
};
