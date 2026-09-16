import type { SurfaceTileBodyId } from '../../@types/data/SurfaceTileBodyId';
import type { Tier } from '../../@types/data/Tier';
import { BODY_TEXTURE_REGISTRY } from '../../data/bodies/bodyTextureRegistry';
import { clampTier } from '../math/clampTier';
import { tierToTexturePx } from '../math/tierToTexturePx';
import { levelFittingWidth } from './levelFittingWidth';

/**
 * baseLevelForTier — the pyramid level `bodyId`'s whole-globe surface texture
 * a session actually binds already delivers.
 *
 * Must describe the image that is BOUND, not the finest that exists: the
 * three tiers bind three different base textures (2048/4096/8192 px, levels
 * 2/3/4), so a single module constant would be true for only one — off the
 * `'large'` ceiling, it once claimed z4 for a `'medium'` session, handing off
 * a z3 base to a z5 tile, a 4x jump where one level of softening was budgeted.
 *
 * `clampTier` against the registry's `surface` ceiling runs first because
 * that decides which FILE is fetched (`assetWiring`'s `bodyTextureRow`
 * clamps the same way); it's a no-op today, which is exactly why it must
 * stay written down.
 */
export function baseLevelForTier(bodyId: SurfaceTileBodyId, tier: Tier): number {
  const surfaceCeiling = BODY_TEXTURE_REGISTRY[bodyId].kinds.surface;
  // A surface-tile registry row that cannot even bind a whole-globe texture
  // is a programming error (a new body row missing from BODY_TEXTURE_REGISTRY),
  // not a runtime state to degrade from.
  if (surfaceCeiling === undefined) {
    throw new Error(`baseLevelForTier: '${bodyId}' has no BODY_TEXTURE_REGISTRY surface kind`);
  }
  const widthPx = tierToTexturePx(clampTier(tier, surfaceCeiling));
  return levelFittingWidth(widthPx);
}
