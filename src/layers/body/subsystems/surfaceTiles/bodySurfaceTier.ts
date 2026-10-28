/**
 * bodySurfaceTier — the tier a body's whole-globe surface texture is bound
 * at, which the tile planner's `baseLevel` must derive from. Reads
 * `committed().req`, NOT `lastRequest()`: the latter already reports the NEW
 * tier the instant a reload starts, before the fragment samples it — the
 * exact lie this function exists to prevent. No commit yet → the arriving tier.
 */

import { bodyTextureSlotKey } from '../../../../utils/bodyTextures/bodyTextureSlotKey';

import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';
import type { BodyTextureId } from '../../../../@types/data/BodyTextureId';
import type { Tier } from '../../../../@types/data/Tier';
import type { BodyTextureReq } from '../../../../@types/loading/BodyTextureReq';

export function bodySurfaceTier(
  state: Pick<EngineState, 'slotsByKey' | 'tier'>,
  bodyId: SceneBodyId,
): Tier {
  const slot = state.slotsByKey.get(bodyTextureSlotKey(bodyId as BodyTextureId, 'surface'));
  // `slotsByKey` erases the request type; a body-texture slot's is a `BodyTextureReq`.
  return (slot?.committed()?.req as BodyTextureReq | undefined)?.tier ?? state.tier;
}
