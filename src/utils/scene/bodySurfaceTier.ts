/**
 * bodySurfaceTier — the tier a body's whole-globe surface texture is bound
 * at, which the tile planner's `baseLevel` must derive from. `state.tier` is
 * a REQUEST; the fragment samples whatever `<bodyId>:surface` last committed,
 * and the two disagree until that commit lands.
 *
 * Reads `committed().req`, NOT `lastRequest()`: the latter already reports
 * the NEW tier the instant a reload starts (set at the top of
 * `AssetSlot.load()`) — the exact lie this function exists to prevent. No
 * commit yet → no honest level, so the fallback is the arriving tier.
 *
 * Generalises `earthSurfaceTier` (`docs/superpowers/plans/2026-09-15-terrain-f1-height-products.md`
 * P2b) over `bodyId` — every `SURFACE_TILE_REGISTRY` member is necessarily a
 * `BodyTextureId` (a surface-tiled body is textured), so the cast is safe.
 */

import { bodyTextureSlotKey } from './bodyTextureSlotKey';

import type { EngineState } from '../../@types/engine/state/EngineState';
import type { BodyId } from '../../@types/data/body/BodyId';
import type { BodyTextureId } from '../../@types/data/BodyTextureId';
import type { Tier } from '../../@types/data/Tier';

export function bodySurfaceTier(state: EngineState, bodyId: BodyId): Tier {
  const slot = state.assetSlots.bodyTextures.get(
    bodyTextureSlotKey(bodyId as BodyTextureId, 'surface'),
  );
  return slot?.committed()?.req.tier ?? state.tier;
}
