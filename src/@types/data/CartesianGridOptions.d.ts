import type { ScalarFieldFrameKind } from './ScalarFieldFrameKind';

export type CartesianGridOptions = {
  /** Cube edge length in voxels.  Default 64. */
  dims?: number;
  /** Frame the cube lives in.  Default `equatorial-cartesian`. */
  frameKind?: ScalarFieldFrameKind;
  /** Physical edge length of the cube in Mpc.  Default 400. */
  boxSizeMpc?: number;
  /** Spacing between successive grid planes in Mpc.  Default 50. */
  gridSpacingMpc?: number;
  /** Half-width of the falloff bell on either side of a plane, in Mpc.
   *  Default 3 — roughly half a voxel at default 64³ / 400 Mpc, so the
   *  planes read as crisp lines rather than fat slabs. */
  lineSigmaMpc?: number;
};
