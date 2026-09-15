import type { SurfacePatchAnchor } from '../../@types/scene/SurfacePatchAnchor';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * patchVertexOffsetM — a template vertex's offset from its patch's origin
 * corner, in the body's fixed axes, metres. Spec §7.1's derivation, and the
 * TS twin of `patchVertexOffset` in
 * `src/services/gpu/shaders/bodies/earthSurfaceTile/vertex.wesl`: same
 * variable names, same order, changed together.
 *
 * `2·sin²(θ/2)` is algebraically `1 − cos θ` and NOT interchangeable with it:
 * at a z19 patch's dlon ≈ 1.2e-5 rad, `1 − cos` cancels away every significant
 * f32 bit while the haversine form keeps them all. Do not "simplify" it back.
 */
export function patchVertexOffsetM(
  anchor: Readonly<SurfacePatchAnchor>,
  radiusM: number,
  s: number,
  t: number,
  /** Metres above the datum, DISTRIBUTED below rather than summed into the
   *  radius: the f32 sum `radiusM + heightM` quantizes to 0.5 m at Earth's
   *  radius and terraces every patch (spec §7.1). */
  heightM: number,
): Vec3 {
  const { lon0Rad, lat0Rad } = anchor;
  const dlon = s * anchor.dLonRad;
  const dlat = t * anchor.dLatRad;
  const lat = lat0Rad + dlat;

  const havLon = 2 * Math.sin(dlon / 2) ** 2;
  const havLat = 2 * Math.sin(dlat / 2) ** 2;
  const cosLat = Math.cos(lat);
  const cE = cosLat * Math.sin(dlon);
  const cN = Math.sin(dlat) + cosLat * Math.sin(lat0Rad) * havLon;
  const cU = -havLat - cosLat * Math.cos(lat0Rad) * havLon;

  const xE = radiusM * cE + heightM * cE;
  const xN = radiusM * cN + heightM * cN;
  const xU = radiusM * cU + heightM * cU + heightM;

  // The ENU frame at (lon0, lat0) in the body's fixed axes — +Z the pole,
  // longitude 0 on +X, the convention `equirectUvToDirection` fixes.
  const sinLon0 = Math.sin(lon0Rad);
  const cosLon0 = Math.cos(lon0Rad);
  const sinLat0 = Math.sin(lat0Rad);
  const cosLat0 = Math.cos(lat0Rad);
  return [
    xE * -sinLon0 + xN * -(sinLat0 * cosLon0) + xU * (cosLat0 * cosLon0),
    xE * cosLon0 + xN * -(sinLat0 * sinLon0) + xU * (cosLat0 * sinLon0),
    xN * cosLat0 + xU * sinLat0,
  ];
}
