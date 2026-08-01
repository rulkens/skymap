/**
 * galaxyFieldInverseCovariance — a mixture component's world-space inverse
 * covariance M: three sigmas, tilted about the pole, then sheared by the warp.
 *
 * The shader consumes M directly because the alternative — passing sigmas plus
 * the shear and forming S^T*M0*S in the fragment shader — would pay a matrix
 * congruence per ray per component, which is the cost the closed form exists
 * to avoid. M changes only when the galaxy is regenerated.
 */
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * M0 = Q^T*D*Q is the tilted diagonal form (Q is the world -> component
 * rotation, x' = ct*x + st*z, z' = ct*z - st*x). The shear is
 * S = I + e_y*(shearX, 0, shearZ), so M = S^T*M0*S; because M0's y row and
 * column are (0, d1, 0), that congruence collapses to the entries below
 * rather than a general 3x3 product.
 */
export function galaxyFieldInverseCovariance(axes: {
  readonly sigmaAlong: number;
  readonly sigmaPole: number;
  readonly sigmaAcross: number;
  readonly tiltRad: number;
  readonly shearX: number;
  readonly shearZ: number;
}): { readonly invCovDiagonal: Vec3; readonly invCovOffDiagonal: Vec3 } {
  const d0 = 1 / (axes.sigmaAlong * axes.sigmaAlong);
  const d1 = 1 / (axes.sigmaPole * axes.sigmaPole);
  const d2 = 1 / (axes.sigmaAcross * axes.sigmaAcross);
  const ct = Math.cos(axes.tiltRad);
  const st = Math.sin(axes.tiltRad);
  const { shearX: a, shearZ: b } = axes;
  return {
    invCovDiagonal: [
      ct * ct * d0 + st * st * d2 + d1 * a * a,
      d1,
      st * st * d0 + ct * ct * d2 + d1 * b * b,
    ],
    invCovOffDiagonal: [d1 * a, ct * st * (d0 - d2) + d1 * a * b, d1 * b],
  };
}
