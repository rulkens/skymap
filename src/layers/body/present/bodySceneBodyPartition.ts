/**
 * bodySceneBodyPartition — `sceneBodyPartition` bound to the body Layer's roster and its
 * textured-body renderer. The `bodyTextureSpec` guard lives here because the renderer is
 * keyed by `BodyTextureId`: the cast below is only valid for registry ids.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { SceneBodyPartition } from '../../../@types/engine/frame/SceneBodyPartition';
import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { BodyRuntime } from '../@types/BodyRuntime';
import { bodyTextureSpec } from '../../../data/bodies/bodyTextureRegistry';
import { BODY_SCENE_BODY_IDS } from './bodySceneBodyIds';
import { sceneBodyPartition } from '../../../services/engine/frame/sceneBodyPartition';

export function bodySceneBodyPartition(
  state: PassState,
  ctx: FrameView,
  runtime: Pick<BodyRuntime, 'texturedBodyRenderer'>,
): SceneBodyPartition {
  return sceneBodyPartition(
    state,
    ctx,
    BODY_SCENE_BODY_IDS,
    (bodyId) =>
      bodyTextureSpec(bodyId) !== null &&
      runtime.texturedBodyRenderer.hasMap(bodyId as BodyTextureId, 'surface'),
  );
}
