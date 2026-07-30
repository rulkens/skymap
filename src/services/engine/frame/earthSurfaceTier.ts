/**
 * earthSurfaceTier — the tier Earth's whole-globe surface texture is actually
 * bound at, which is the tier the tile planner's `baseLevel` has to be derived
 * from.
 *
 * The app-wide `state.tier` is a REQUEST. What the fragment samples is whatever
 * the `earth:surface` slot last committed into `earthRenderer.setMap`, and the
 * two disagree from the moment the tier changes until that fetch commits.
 * Deriving the base level from the request over that window would claim a level
 * the bound image does not carry — the same class of mistake as a module
 * constant claiming the largest tier's level for every session, and the same
 * symptoms: the engage gate stands down early and the tile handoff steps 4x
 * instead of 2x.
 *
 * ## Why `ready` + `lastRequest()` is the committed tier
 *
 * The slot only reaches `ready` when the request it is holding has fetched AND
 * committed; any later `load()` moves it out of `ready` before overwriting
 * `lastRequest()`. So the pair — state `ready`, plus that request's tier — is
 * exactly "the tier of the image on the GPU", with no second field to keep in
 * step. Reading `lastRequest()` alone would report the tier being fetched, which
 * is the requested value again by another route.
 *
 * ## Why the fallback is the requested tier
 *
 * A slot that is not `ready` is either loading its first image — the renderer is
 * on its 1x1 placeholder or the boot atlas tile, neither of which is a pyramid
 * level at all — or loading a replacement, in which case Earth's no-op
 * `onRelease` leaves the previous image bound and unnameable from here. Neither
 * state has an honest base level, so this answers with the tier that is
 * arriving. That costs at most one level of softness for the length of one
 * fetch, it corrects itself the moment the commit lands, and the alternative is
 * a remembered "last committed tier" field — a second copy of a fact the slot
 * already holds, kept in step by hand. Nor is it a state the tiles see often:
 * the surface texture is demanded on entering Earth's whole load radius, while
 * the virtual texture engages only on close approach, far inside it.
 */

import { bodyTextureSlotKey } from '../../../utils/scene/bodyTextureSlotKey';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Tier } from '../../../@types/data/Tier';

export function earthSurfaceTier(state: EngineState): Tier {
  const slot = state.assetSlots.bodyTextures.get(bodyTextureSlotKey('earth', 'surface'));
  if (slot === undefined || slot.state().kind !== 'ready') return state.tier;
  return slot.lastRequest()?.tier ?? state.tier;
}
