/**
 * terrainPickUnderCursor — the `terrain-pick-marker` instrument's pick: the cursor ray
 * against the tile stream's own ground. The arm is rebuilt from the SAME pose provider
 * the slab's `vp` came from, anchored at the body centre so `eyeRelAnchorM` IS
 * `eyeRelBodyM`; the marker pass and the published readout share it, so the number
 * the panel shows is the point the marker sits on.
 */

import type { BodyFixedPose } from '../../../@types/camera/BodyFixedPose';
import type { BodyRelativePose } from '../../../@types/engine/camera/BodyRelativePose';
import type { SurfacePick } from '../../../@types/camera/SurfacePick';
import type { SceneBodyId } from '../../../@types/scene/SceneBodyId';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { BodyRuntime } from '../@types/BodyRuntime';
import { terrainPickAt } from './terrainPickAt';

export function terrainPickUnderCursor(input: {
  readonly tiles: BodyRuntime['surfaceTiles'];
  readonly bodyId: SceneBodyId;
  readonly pose: BodyRelativePose;
  readonly cursorPx: Readonly<Vec2>;
  readonly viewportPx: Readonly<Vec2>;
  readonly fovYRad: number;
}): SurfacePick | null {
  const { tiles, bodyId, pose } = input;
  const eyeM = pose.eyeRelBodyM;
  const arm: BodyFixedPose = {
    bodyId,
    anchorLocalM: [0, 0, 0],
    eyeRelAnchorM: [eyeM[0], eyeM[1], eyeM[2]],
    basisLocal: [...pose.basisM],
  };
  return terrainPickAt({
    arm,
    cursorPx: input.cursorPx,
    viewportPx: input.viewportPx,
    fovYRad: input.fovYRad,
    terrainHeightAt: (b, d) => tiles.stream.heightAt(b, d, tiles.plan.params),
  });
}
