import type { ScalarFieldFrameKind } from './ScalarFieldFrameKind';

export type SphericalGridOptions = {
  /** Cube edge length in voxels.  Default 64. */
  dims?: number;
  /** Frame the cube lives in.  Default `equatorial-cartesian`. */
  frameKind?: ScalarFieldFrameKind;
  /** Physical edge length of the cube in Mpc.  Default 400. */
  boxSizeMpc?: number;
  /** Spacing between successive shells in Mpc.  Default 50 (so shells
   *  appear at 50, 100, 150, … from the origin). */
  shellSpacingMpc?: number;
  /** Half-width of the falloff on either side of a shell radius, in
   *  Mpc.  Default 3. */
  shellSigmaMpc?: number;
  /** Half-width of the falloff for a radial spoke (perpendicular
   *  distance to the axis), in Mpc.  Default 2 — slightly tighter than
   *  the shells so spokes read as lines, not tubes. */
  spokeSigmaMpc?: number;
};
