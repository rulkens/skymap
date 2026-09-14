/**
 * earthSurfaceTier — the tier Earth's whole-globe surface texture is bound
 * at, which the tile planner's `baseLevel` must derive from. `state.tier` is
 * a REQUEST; the fragment samples whatever `earth:surface` last committed,
 * and the two disagree until that commit lands.
 *
 * Reads `committed().req`, NOT `lastRequest()`: the latter already reports
 * the NEW tier the instant a reload starts (set at the top of
 * `AssetSlot.load()`) — the exact lie this function exists to prevent. No
 * commit yet → no honest level, so the fallback is the arriving tier.
 */

import { bodyTextureSlotKey } from '../../../utils/scene/bodyTextureSlotKey';

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { Tier } from '../../../@types/data/Tier';

export function earthSurfaceTier(state: PassState): Tier {
  const slot = state.assetSlots.bodyTextures.get(bodyTextureSlotKey('earth', 'surface'));
  return slot?.committed()?.req.tier ?? state.tier;
}
