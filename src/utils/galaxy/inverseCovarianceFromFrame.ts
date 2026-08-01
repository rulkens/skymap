/**
 * inverseCovarianceFromFrame — a component's world-space inverse covariance
 * from an ARBITRARY orthonormal frame plus one sigma per axis:
 * M = sum_i u_i u_i^T / sigma_i^2.
 *
 * The general form `galaxyFieldInverseCovariance` cannot express: that one
 * takes a pole-axis tilt plus a shear, which can only tip a blob about +Y.
 * A blob laid tangent to the warped disc is tipped about its own radial axis
 * too (see `warpSurfaceFrame`), so its frame is a full rotation.
 */
import type { Vec3 } from '../../@types/math/Vec3';

/** Off-diagonal is (m01, m02, m12); the shader's quadratic form doubles it. */
export function inverseCovarianceFromFrame(
  frame: { readonly along: Vec3; readonly across: Vec3; readonly pole: Vec3 },
  sigmas: { readonly along: number; readonly across: number; readonly pole: number },
): { readonly invCovDiagonal: Vec3; readonly invCovOffDiagonal: Vec3 } {
  const axes: readonly (readonly [Vec3, number])[] = [
    [frame.along, sigmas.along],
    [frame.across, sigmas.across],
    [frame.pole, sigmas.pole],
  ];
  let m00 = 0;
  let m11 = 0;
  let m22 = 0;
  let m01 = 0;
  let m02 = 0;
  let m12 = 0;
  for (const [u, sigma] of axes) {
    const k = 1 / (sigma * sigma);
    m00 += k * u[0] * u[0];
    m11 += k * u[1] * u[1];
    m22 += k * u[2] * u[2];
    m01 += k * u[0] * u[1];
    m02 += k * u[0] * u[2];
    m12 += k * u[1] * u[2];
  }
  return { invCovDiagonal: [m00, m11, m22], invCovOffDiagonal: [m01, m02, m12] };
}
