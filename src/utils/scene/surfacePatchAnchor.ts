import type { SurfacePatchAnchor } from '../../@types/scene/SurfacePatchAnchor';
import { TEXTURE_PRIME_MERIDIAN_U } from '../../data/bodies/texturePrimeMeridianU';

/**
 * surfacePatchAnchor — a patch's uv footprint as angles: the ONE place the
 * equirect registration enters the patch geometry path. Same expressions as
 * `equirectUvToDirection` (which the walk still uses for centres and corners),
 * so the two name the identical corner bit-for-bit.
 *
 * `v0` is the SOUTH edge — mesh `v` counts north, tile rows count south, and
 * `cutSurfaceTiles` has already applied that flip by the time it calls here.
 */
export function surfacePatchAnchor(
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): SurfacePatchAnchor {
  return {
    lon0Rad: (u0 - TEXTURE_PRIME_MERIDIAN_U) * 2 * Math.PI,
    lat0Rad: (v0 - 0.5) * Math.PI,
    dLonRad: (u1 - u0) * 2 * Math.PI,
    dLatRad: (v1 - v0) * Math.PI,
  };
}
