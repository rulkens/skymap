/**
 * earthSurfaceTier — the tier Earth's whole-globe surface texture is actually
 * bound at, which the tile planner's `baseLevel` must be derived from.
 *
 * The app-wide `state.tier` is a REQUEST; the fragment samples whatever the
 * `earth:surface` slot last committed, and the two disagree until that fetch
 * commits. Deriving `baseLevel` from the request over that window would claim
 * a level the bound image doesn't carry.
 *
 * `ready` + `lastRequest()` is the committed tier: the slot only reaches
 * `ready` once its request has fetched AND committed. A slot that is not
 * `ready` is loading a first image or a replacement, neither with an honest
 * base level, so the fallback is the arriving tier.
 */

import { bodyTextureSlotKey } from '../../../utils/scene/bodyTextureSlotKey';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Tier } from '../../../@types/data/Tier';

export function earthSurfaceTier(state: EngineState): Tier {
  const slot = state.assetSlots.bodyTextures.get(bodyTextureSlotKey('earth', 'surface'));
  if (slot === undefined || slot.state().kind !== 'ready') return state.tier;
  return slot.lastRequest()?.tier ?? state.tier;
}
