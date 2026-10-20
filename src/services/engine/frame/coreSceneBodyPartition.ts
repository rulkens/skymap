/**
 * coreSceneBodyPartition — `sceneBodyPartition` bound to core's roster and its textured-body
 * renderer. The `bodyTextureSpec` guard lives here because `texturedBodyRenderer` is keyed
 * by `BodyTextureId`: the cast below is only valid for registry ids.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { SceneBodyPartition } from '../../../@types/engine/frame/SceneBodyPartition';
import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import { bodyTextureSpec } from '../../../data/bodies/bodyTextureRegistry';
import { coreSceneBodyIds } from './coreSceneBodyIds';
import { sceneBodyPartition } from './sceneBodyPartition';

export function coreSceneBodyPartition(state: PassState, ctx: FrameView): SceneBodyPartition {
  return sceneBodyPartition(
    state,
    ctx,
    coreSceneBodyIds(ctx.snapshot.meshBodies),
    // Before the GPU is up nothing is bound, hence the `?? false`.
    (bodyId) =>
      bodyTextureSpec(bodyId) !== null &&
      (state.gpu.texturedBodyRenderer?.hasMap(bodyId as BodyTextureId, 'surface') ?? false),
  );
}
