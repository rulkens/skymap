import type { Vec4 } from '../../../../../@types/math/Vec4';
import type { ResolvedTileResidency } from '../../stream/@types/ResolvedTileResidency';
import { HORIZON_TILE_ATLAS_SIDE, HORIZON_TILE_PX } from '../../format/data/surfaceTileParams';
import { HORIZON_POSTS_PER_TILE } from '../data/horizonAngleMap';

const SLOT_UV = HORIZON_TILE_PX / HORIZON_TILE_ATLAS_SIDE;
// A slot holds 33 posts but spans 32 post steps: post 32 is the tile's east (south) edge.
const STEPS_PER_POST = (HORIZON_POSTS_PER_TILE - 1) / HORIZON_POSTS_PER_TILE;

/**
 * horizonPostRect — a leaf's horizon-atlas rect (slot uv, as `resolveStandaloneRect` gives it)
 * as `lib/horizonLookup.wesl` reads it: post uv, where uv 0…1 across the leaf's tile lands on
 * posts 0…32 of its slot, not 0…33. The slot is the one the rect's centre lies in.
 */
export function horizonPostRect(
  rect: Pick<ResolvedTileResidency, 'atlasUvOrigin' | 'atlasUvScale'>,
): Vec4 {
  const axis = (origin: number, scale: number): [number, number] => {
    const slotOrigin = Math.floor((origin + scale / 2) / SLOT_UV) * SLOT_UV;
    return [slotOrigin + (origin - slotOrigin) * STEPS_PER_POST, scale * STEPS_PER_POST];
  };
  const [originU, scaleU] = axis(rect.atlasUvOrigin[0], rect.atlasUvScale[0]);
  const [originV, scaleV] = axis(rect.atlasUvOrigin[1], rect.atlasUvScale[1]);
  return [originU, originV, scaleU, scaleV];
}
