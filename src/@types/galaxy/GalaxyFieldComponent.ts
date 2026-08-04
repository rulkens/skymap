/**
 * GalaxyFieldComponent — one Gaussian blob of the analytic galaxy emission
 * field (`milkyWay/field/splat.wesl`).
 *
 * All lengths are GENERATOR units, the space `milkyWay/sprites/generate.wesl` places
 * stars in (for the Milky Way preset 1 unit = 1.6667 kpc). The disc plane is
 * XZ and the pole is +Y.
 *
 * The shape is carried as the inverse covariance M of
 * exp(-0.5*(p-center)^T*M*(p-center)) rather than as sigmas plus a tilt: a
 * component's own warp shear (linearised about ITS centre) tilts it out of
 * any axis-aligned frame, and a general symmetric M is the only form that
 * stays closed under that (see `galaxyFieldInverseCovariance`).
 */
import type { Vec3 } from '../math/Vec3';

export type GalaxyFieldComponent = {
  /** Peak emissivity, relative — the mixture is normalised by an exposure knob, not physically. */
  readonly amplitude: number;
  /** (m00, m11, m22) of M, in 1/length^2. */
  readonly invCovDiagonal: Readonly<Vec3>;
  /** (m01, m02, m12) of M — m01 and m12 are nonzero only where the warp shears. */
  readonly invCovOffDiagonal: Readonly<Vec3>;
  /** Linear RGB tint, multiplied into this component's integrated emission. */
  readonly color: Readonly<Vec3>;
  /** World-space centre of exp(-0.5*(p-center)^T*M*(p-center)); [0,0,0] for an origin-centred component. */
  readonly center: Readonly<Vec3>;
  /**
   * World-space bounding radius (max sigma, warp-inflated where applicable) —
   * a billboard sizing hint for the splat render path, not part of the
   * Gaussian's own math. See `galaxyFieldMixture.ts`'s push sites.
   */
  readonly boundRadius: number;
};
