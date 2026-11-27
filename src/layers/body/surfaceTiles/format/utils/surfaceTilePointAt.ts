import type { Vec3 } from '../../../../../../packages/shared/src/@types/math/Vec3';
import type { SurfaceTilePoint } from '../@types/SurfaceTilePoint';
import { TEXTURE_PRIME_MERIDIAN_U } from '../../../../../data/bodies/texturePrimeMeridianU';
import { surfaceTileColumns } from './surfaceTileColumns';
import { surfaceTileXyForUv } from './surfaceTileXyForUv';

/**
 * surfaceTilePointAt — which tile of level `z` a body-fixed direction falls in, and where inside
 * it. Null for a zero or non-finite direction: a NaN here would reach the camera or a uniform.
 * The exact inverse of `equirectUvToDirection`, then the fractional remainder of the SAME
 * `u · cols` and `(1 − v) · rows` that `surfaceTileXyForUv` floors, so the uv runs south from the
 * tile's north row (the `1 − v` flip lives there, not in a second formula here).
 */
export function surfaceTilePointAt(
  dirBodyFixed: Readonly<Vec3>,
  z: number,
  tilePx: number,
): SurfaceTilePoint | null {
  const [dx, dy, dz] = dirBodyFixed;
  const magM = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(magM) || magM === 0) return null;
  const lon = Math.atan2(dy / magM, dx / magM);
  const lat = Math.asin(Math.min(1, Math.max(-1, dz / magM)));
  const u = lon / (2 * Math.PI) + TEXTURE_PRIME_MERIDIAN_U;
  const v = lat / Math.PI + 0.5;
  const cols = surfaceTileColumns(z, tilePx);
  const [x, y] = surfaceTileXyForUv([u, v], z, tilePx);
  return {
    x,
    y,
    uv: [u * cols - Math.floor(u * cols), Math.min(1, Math.max(0, (1 - v) * (cols / 2) - y))],
  };
}
