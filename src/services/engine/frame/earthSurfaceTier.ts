/**
 * earthSurfaceTier — the tier Earth's whole-globe surface texture is actually
 * bound at, which the tile planner's `baseLevel` must be derived from.
 *
 * The app-wide `state.tier` is a REQUEST; the fragment samples whatever the
 * `earth:surface` slot last committed, and the two disagree until that fetch
 * commits. Deriving `baseLevel` from the request over that window would claim
 * a level the bound image doesn't carry.
 *
 * `committed().req` is the committed tier, NOT `lastRequest()`: that reports
 * the NEW tier the instant a reload starts (`AssetSlot.ts` sets it at the top
 * of `load()`), the exact lie this function exists to prevent. A slot with no
 * commit yet is loading its first image, with no honest base level, so the
 * fallback is the arriving tier.
 */

import { bodyTextureSlotKey } from '../../../utils/scene/bodyTextureSlotKey';

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { Tier } from '../../../@types/data/Tier';

export function earthSurfaceTier(state: PassState): Tier {
  const slot = state.assetSlots.bodyTextures.get(bodyTextureSlotKey('earth', 'surface'));
  return slot?.committed()?.req.tier ?? state.tier;
}
