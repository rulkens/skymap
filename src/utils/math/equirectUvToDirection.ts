import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import { TEXTURE_PRIME_MERIDIAN_U } from '../../data/bodies/texturePrimeMeridianU';

/**
 * equirectUvToDirection — the unit direction on the sphere that an
 * equirectangular uv names, in the body's local frame.
 *
 * The exact inverse of what `cubeSphereMesh` and `uvSphereMesh` bake into their
 * vertex uv (`cubeSphereMesh.ts:164-166`), and therefore of the shader's
 * `dirToEquirectUv` (`shaders/bodies/earth/fragment.wesl`), which goes the other
 * way for the cloud-shadow crossing point:
 *
 *   lon = (u - TEXTURE_PRIME_MERIDIAN_U) · 2π     longitude, 0 on +X, +π/2 on +Y
 *   lat = (v - 0.5) · π                            latitude, v = 0 is the SOUTH pole
 *
 * The prime-meridian offset is imported rather than re-spelled as 0.5, because
 * it is a real convention with a real alternative (a raw `u = lon/2π` would put
 * the map's antimeridian on +X and ride every continent on the wrong hemisphere)
 * and it already has a home. The shader re-encodes it only because WGSL cannot
 * import a TS constant.
 *
 * Used by the Earth tile planner to test a tile patch's corners against the
 * horizon and the frustum: those are questions about directions in space, and
 * uv is the only address the tile grid speaks.
 */
export function equirectUvToDirection(uv: Readonly<Vec2>): Vec3 {
  const lon = (uv[0] - TEXTURE_PRIME_MERIDIAN_U) * 2 * Math.PI;
  const lat = (uv[1] - 0.5) * Math.PI;
  const cosLat = Math.cos(lat);
  return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)];
}
