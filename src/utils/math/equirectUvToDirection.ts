import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import { TEXTURE_PRIME_MERIDIAN_U } from '../../data/bodies/texturePrimeMeridianU';

/**
 * equirectUvToDirection — the unit direction on the sphere that an
 * equirectangular uv names, in the body's local frame. Exact inverse of what
 * `cubeSphereMesh`/`uvSphereMesh` bake into their vertex uv (`cubeSphereMesh.ts:164-166`):
 *
 *   lon = (u - TEXTURE_PRIME_MERIDIAN_U) · 2π     longitude, 0 on +X, +π/2 on +Y
 *   lat = (v - 0.5) · π                            latitude, v = 0 is the SOUTH pole
 *
 * The prime-meridian offset is imported, not re-spelled as 0.5: a raw
 * `u = lon/2π` would put the antimeridian on +X, wrong-hemisphere every continent.
 */
export function equirectUvToDirection(uv: Readonly<Vec2>): Vec3 {
  const lon = (uv[0] - TEXTURE_PRIME_MERIDIAN_U) * 2 * Math.PI;
  const lat = (uv[1] - 0.5) * Math.PI;
  const cosLat = Math.cos(lat);
  return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)];
}
