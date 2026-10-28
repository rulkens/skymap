/**
 * bodySurfaceTier — the tier a body's whole-globe surface texture is bound
 * at, which the tile planner's `baseLevel` must derive from. Reads
 * `committed().req`, NOT `lastRequest()`: the latter already reports the NEW
 * tier the instant a reload starts, before the fragment samples it — the
 * exact lie this function exists to prevent. No commit yet → the arriving tier.
 */

import { bodyTextureSlotKey } from './bodyTextureSlotKey';
import { slotFor } from '../../services/engine/wiring/slotFor';

import type { EngineState } from '../../@types/engine/state/EngineState';
import type { SceneBodyId } from '../../@types/scene/SceneBodyId';
import type { BodyTextureId } from '../../@types/data/BodyTextureId';
import type { Tier } from '../../@types/data/Tier';
import type { BodyTextureReq } from '../../@types/loading/BodyTextureReq';

export function bodySurfaceTier(
  state: Pick<EngineState, 'layerSlots' | 'assetSlots' | 'tier'>,
  bodyId: SceneBodyId,
): Tier {
  const slot = slotFor(state, bodyTextureSlotKey(bodyId as BodyTextureId, 'surface'));
  // `slotFor` erases the request type; a body-texture slot's is a `BodyTextureReq`.
  return (slot?.committed()?.req as BodyTextureReq | undefined)?.tier ?? state.tier;
}
