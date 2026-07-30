import type { Tier } from '../../@types/data/Tier';
import { BODY_TEXTURE_REGISTRY } from '../../data/bodies/bodyTextureRegistry';
import { clampTier } from '../math/clampTier';
import { tierToTexturePx } from '../math/tierToTexturePx';
import { earthLevelFittingWidth } from './earthLevelFittingWidth';

/**
 * earthBaseLevelForTier — the pyramid level the whole-globe surface texture a
 * session actually binds already delivers.
 *
 * This is the number `planEarthTiles` roots its walk at and the number the tile
 * subsystem's engage gate compares `zWin` against, so it has to describe the
 * image that is bound, not the finest image that exists. The three tiers are
 * three different base textures — 2048, 4096 and 8192 px wide, i.e. levels 2, 3
 * and 4 on the `EARTH_EQUIRECT_BASE_WIDTH_PX << z` ladder — so a single module
 * constant can only be true for one of them. Written as a constant off the
 * `'large'` ceiling, it claimed z4 for every session, and a default `'medium'`
 * session then believed its base carried a level it did not have: the engage
 * gate stood down one level early (soft pixels where the screen wanted more)
 * and the handoff put a z3 base under a z5 tile, a 4x linear jump where one
 * level of softening was the whole budget.
 *
 * ## The ceiling clamp comes first
 *
 * `clampTier` against the registry's `surface` ceiling is what decides which
 * FILE is fetched (`assetWiring`'s `bodyTextureRow` clamps the same way), so
 * clamping here is what keeps this function describing the bound image rather
 * than the requested one. Earth's surface ceiling is `'large'` today, which
 * makes the clamp a no-op — and that is exactly why it must be written down:
 * lowering the ceiling would otherwise leave this reporting a level no bound
 * texture carries, with no error anywhere.
 *
 * ## The ladder inversion itself lives elsewhere
 *
 * `earthLevelFittingWidth` turns a raster width into a level, for this function
 * and for the build-time imagery sources alike. Its header carries why that
 * inversion is a shift loop rather than `Math.log2`; the consequence HERE is the
 * worse of the two, because a non-integer level makes every `z` in the quadtree
 * walk non-integer, so every tile path is a decimal that 404s and every
 * `1 << (zWin - z)` span in the page-table window is nonsense.
 */
export function earthBaseLevelForTier(tier: Tier): number {
  // Non-null: every registry row ships a `surface` kind (the `kinds` map is
  // Partial only because the feature kinds are per-body).
  const widthPx = tierToTexturePx(clampTier(tier, BODY_TEXTURE_REGISTRY.earth.kinds.surface!));
  return earthLevelFittingWidth(widthPx);
}
