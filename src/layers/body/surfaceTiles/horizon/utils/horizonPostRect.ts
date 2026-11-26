import type { Vec4 } from '../../../../../@types/math/Vec4';
import type { ResolvedTileResidency } from '../../stream/@types/ResolvedTileResidency';
import { HORIZON_TILE_ATLAS_SIDE, HORIZON_TILE_PX } from '../../format/data/surfaceTileParams';
import { HORIZON_POSTS_PER_TILE } from '../data/horizonAngleMap';

const SLOT_UV = HORIZON_TILE_PX / HORIZON_TILE_ATLAS_SIDE;
// A slot holds 129 posts but spans 128 post steps: post 128 is the tile's east (south) edge.
const STEPS_PER_POST = (HORIZON_POSTS_PER_TILE - 1) / HORIZON_POSTS_PER_TILE;

/**
 * horizonPostRect — a leaf's horizon-atlas rect (slot uv, as `resolveStandaloneRect` gives it)
 * as `lib/horizonLookup.wesl` reads it: post uv, where uv 0…1 across the leaf's tile lands on
 * posts 0…128 of its slot, not 0…129. The slot is the one the rect's centre lies in.
 */
export function horizonPostRect(
  rect: Pick<ResolvedTileResidency, 'atlasUvOrigin' | 'atlasUvScale'>,
): Vec4 {
  const [originU, originV] = rect.atlasUvOrigin;
  const [scaleU, scaleV] = rect.atlasUvScale;
  const slotU = Math.floor((originU + scaleU / 2) / SLOT_UV) * SLOT_UV;
  const slotV = Math.floor((originV + scaleV / 2) / SLOT_UV) * SLOT_UV;
  return [
    slotU + (originU - slotU) * STEPS_PER_POST,
    slotV + (originV - slotV) * STEPS_PER_POST,
    scaleU * STEPS_PER_POST,
    scaleV * STEPS_PER_POST,
  ];
}
