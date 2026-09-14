import type { SurfacePatchAnchor } from '../../@types/scene/SurfacePatchAnchor';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * patchOriginRelEyeM — the patch origin corner relative to the eye, in the
 * body's fixed axes, metres. Spec §7.1's CPU/GPU contract: round the triple
 * `(radiusM, lon0Rad, lat0Rad)` to f32 FIRST, then derive the f64 origin from
 * the rounded values. Derive it from the f64 angles while the shader builds
 * its frame from `f32(lat0)` and every patch shifts coherently by ~0.13 m,
 * differently per patch — which is cracks.
 *
 * The other half needs no discipline: `DataView.setFloat32` rounds exactly the
 * same way, so the record and the uniform carry the very words rounded here.
 */
export function patchOriginRelEyeM(
  anchor: Readonly<SurfacePatchAnchor>,
  radiusM: number,
  eyeRelBodyM: Readonly<Vec3>,
): Vec3 {
  const r = Math.fround(radiusM);
  const lon0 = Math.fround(anchor.lon0Rad);
  const lat0 = Math.fround(anchor.lat0Rad);
  const cosLat0 = Math.cos(lat0);
  return [
    r * cosLat0 * Math.cos(lon0) - eyeRelBodyM[0],
    r * cosLat0 * Math.sin(lon0) - eyeRelBodyM[1],
    r * Math.sin(lat0) - eyeRelBodyM[2],
  ];
}
