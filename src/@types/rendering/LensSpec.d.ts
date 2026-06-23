import type { Vec3 } from '../math/Vec3';

/**
 * LensSpec — one gravitational lens for the points pass: a world-space centre
 * (Mpc) and an Einstein angular radius (radians).
 *
 * The multi-lens model packs an array of these into the points uniform buffer
 * (see `packPointUniforms`), one per in-view cluster. The vertex shader sums
 * the deflection of every foreground lens and renders the dominant lens's
 * counter-image — so each massive cluster shows an Einstein ring and the field
 * between them carries the summed weak-lensing shear. `thetaERad` is already
 * the per-cluster value (the master strength scaled by the cluster's mass
 * proxy); the shader applies only the per-source `D_ls/D_s` distance factor.
 */
export type LensSpec = {
  readonly center: Readonly<Vec3>;
  readonly thetaERad: number;
};
