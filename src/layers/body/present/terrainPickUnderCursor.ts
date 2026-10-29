/**
 * terrainPickUnderCursor — the `terrain-pick-marker` instrument's pick: the cursor ray
 * against the tile stream's own ground. The arm is rebuilt from the SAME pose provider
 * the slab's `vp` came from, anchored at the body centre so `eyeRelAnchorM` IS
 * `eyeRelBodyM`; the marker pass and the published readout share it, so the number
 * the panel shows is the point the marker sits on. Same marcher, tolerance and shells
 * as `latchSurfaceGesture`, but WITHOUT its datum-sphere fallback: an instrument that
 * hid a miss would hide the thing it is here to show.
 */

import type { BodyFixedPose } from '../../../@types/camera/BodyFixedPose';
import type { BodyRelativePose } from '../../../@types/engine/camera/BodyRelativePose';
import type { SurfacePick } from '../../../@types/camera/SurfacePick';
import type { SceneBodyId } from '../../../@types/scene/SceneBodyId';
import type { Vec2 } from '../../../@types/math/Vec2';
import { SCENE_CELESTIAL_BODIES } from '../../../data/bodies/sceneCelestialBodies';
import { cursorRayBodyLocal } from '../../../utils/camera/cursorRayBodyLocal';
import { raycastTerrain } from '../../../utils/camera/raycastTerrain';
import { surfacePickToleranceM } from '../../../utils/camera/surfacePickToleranceM';
import { innerBoundRadiusM } from '../../../utils/occlusion/innerBoundRadiusM';
import { outerBoundRadiusM } from '../../../utils/occlusion/outerBoundRadiusM';
import { bodyGroundRadiusAtM } from '../../../utils/scene/bodyGroundRadiusAtM';
import type { BodyRuntime } from '../@types/BodyRuntime';

export function terrainPickUnderCursor(input: {
  readonly tiles: BodyRuntime['surfaceTiles'];
  readonly bodyId: SceneBodyId;
  readonly pose: BodyRelativePose;
  /** Cursor and viewport in ONE pixel space; only their ratio reaches the ray. */
  readonly cursorPx: Readonly<Vec2>;
  readonly viewportPx: Readonly<Vec2>;
  readonly fovYRad: number;
}): SurfacePick | null {
  const { tiles, bodyId, pose, cursorPx, viewportPx, fovYRad } = input;
  const body = SCENE_CELESTIAL_BODIES.find((row) => row.id === bodyId);
  if (body === undefined) return null;

  const eyeM = pose.eyeRelBodyM;
  const arm: BodyFixedPose = {
    bodyId,
    anchorLocalM: [0, 0, 0],
    eyeRelAnchorM: [eyeM[0], eyeM[1], eyeM[2]],
    basisLocal: [...pose.basisM],
  };
  return raycastTerrain(
    cursorRayBodyLocal(arm, cursorPx, viewportPx, fovYRad),
    innerBoundRadiusM(body.surface),
    outerBoundRadiusM(body.surface),
    (dir) => bodyGroundRadiusAtM(body, tiles.stream.heightAt(bodyId, dir, tiles.plan.params)),
    surfacePickToleranceM(eyeM, body.surface.datumRadiusM, fovYRad, viewportPx[1]),
  );
}
