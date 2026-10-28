/**
 * bodySurfaceTier — the tier a body's whole-globe surface texture is bound
 * at, which the tile planner's `baseLevel` must derive from. Reads
 * `committed().req`, NOT `lastRequest()`: the latter already reports the NEW
 * tier the instant a reload starts, before the fragment samples it — the
 * exact lie this function exists to prevent. No commit yet → the arriving tier.
 */

import { bodyTextureSlotKey } from '../../../utils/bodyTextures/bodyTextureSlotKey';

import type { BodyRuntime } from '../@types/BodyRuntime';
import type { SceneBodyId } from '../../../@types/scene/SceneBodyId';
import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { Tier } from '../../../@types/data/Tier';

export function bodySurfaceTier(
  textureSlots: BodyRuntime['textureSlots'],
  requestedTier: Tier,
  bodyId: SceneBodyId,
): Tier {
  const slot = textureSlots.get(bodyTextureSlotKey(bodyId as BodyTextureId, 'surface'));
  return slot?.committed()?.req.tier ?? requestedTier;
}
