import type { Vec3 } from '../math/Vec3';

/**
 * LensSpec — one gravitational lens for the points pass: eye-relative geometry
 * precomputed each frame from the current camera pose.
 *
 * `dirLens` is the unit vector from the eye toward the cluster centre,
 * computed as `(worldPos − camPos) / |worldPos − camPos|` in world space
 * each frame. `dL` is the eye→lens distance in Mpc. Both are recomputed
 * every frame so the shader never touches world coordinates directly.
 *
 * `thetaERad` is the per-cluster Einstein angular radius (rad): the global
 * `lensStrength` multiplier times the physical asymptotic deflection α∞
 * derived from this cluster's R500. The shader applies only the per-source
 * `D_ls/D_s` distance factor at draw time.
 *
 * `rsMpc` is the NFW scale radius r_s = R500/c500 (Mpc) for this cluster.
 * Carrying it per-lens means each cluster gets the right deflection peak
 * without a shared global knob.
 */
export type LensSpec = {
  readonly dirLens: Readonly<Vec3>;
  readonly dL: number;
  readonly thetaERad: number;
  readonly rsMpc: number;
};
