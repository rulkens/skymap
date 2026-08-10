/**
 * warpSurfaceFrame — the orthonormal frame of the WARPED disc surface at one
 * (radius, azimuth), so a mixture blob can be laid tangent to the surface it
 * sits on instead of tilted by a plane through the origin.
 *
 * The surface is P(R, phi) = (R cos phi, h(R, phi), R sin phi) with h from
 * `warpHeight`. Its two tangents and their normal ARE the blob's three axes:
 * long azimuthally, narrow radially, thin along the normal.
 */
import { normalize3 } from '../math/normalize3';
import type { GalaxyDescription } from '../../@types/galaxy/GalaxyDescription';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * `across` is Gram-Schmidt'd against `along` rather than used raw: the two
 * tangents are only orthogonal where the warp is flat, and a non-orthogonal
 * basis would make the returned sigmas mean something other than the blob's
 * actual extents.
 */
export function warpSurfaceFrame(
  radius: number,
  azimuth: number,
  geometry: GalaxyDescription,
): { readonly along: Vec3; readonly across: Vec3; readonly pole: Vec3 } {
  const { warpStrength, warpTwist, warpStartRadius, outerRadius } = geometry;
  const cosPhi = Math.cos(azimuth);
  const sinPhi = Math.sin(azimuth);

  let dhdR = 0;
  let dhdPhi = 0;
  if (warpStrength > 0 && radius > warpStartRadius) {
    const span = Math.max(1e-4, outerRadius - warpStartRadius);
    const rel = (radius - warpStartRadius) / span;
    const node = warpTwist * rel;
    const amp = warpStrength * outerRadius * 0.4 * rel * rel;
    // d/dR of amp*sin(phi - node), both factors varying with R through rel.
    const dAmp = (warpStrength * outerRadius * 0.4 * 2 * rel) / span;
    const dNode = warpTwist / span;
    dhdR = dAmp * Math.sin(azimuth - node) - amp * dNode * Math.cos(azimuth - node);
    dhdPhi = amp * Math.cos(azimuth - node);
  }

  const along = normalize3([-sinPhi, dhdPhi / Math.max(1e-6, radius), cosPhi]);
  const radial: Vec3 = [cosPhi, dhdR, sinPhi];
  const dot = radial[0] * along[0] + radial[1] * along[1] + radial[2] * along[2];
  const across = normalize3([
    radial[0] - dot * along[0],
    radial[1] - dot * along[1],
    radial[2] - dot * along[2],
  ]);
  // along x across, which is +Y on a flat disc — the generator's pole.
  const pole: Vec3 = [
    along[1] * across[2] - along[2] * across[1],
    along[2] * across[0] - along[0] * across[2],
    along[0] * across[1] - along[1] * across[0],
  ];
  return { along, across, pole };
}
