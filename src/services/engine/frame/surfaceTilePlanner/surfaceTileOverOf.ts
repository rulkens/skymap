/**
 * surfaceTileOverOf — the tiling body the eye is over (`SurfaceTileOver`): the
 * nearest within its `TILE_RELEASE_RADII`, by the view's body pose alone, so
 * with several in reach the nearer wins, never the registry's first. Every
 * view shares the frame's eye, so the caller passes the first.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { SurfaceTileOver } from '../../../../@types/engine/surfaceTiles/SurfaceTileOver';
import { SCENE_CELESTIAL_BODIES } from '../../../../data/bodies/sceneCelestialBodies';
import { TILE_RELEASE_RADII } from '../../../../data/bodies/surfaceTileParams';
import { findByIdOrThrow } from '../../../../utils/object/findByIdOrThrow';
import { asSceneBodyId } from '../../../../utils/scene/asSceneBodyId';
import { isSurfaceTileBodyId } from '../../../../utils/surfaceTiles/isSurfaceTileBodyId';

export function surfaceTileOverOf(view: FrameView): SurfaceTileOver | null {
  let over: SurfaceTileOver | null = null;
  let nearestM = Infinity;
  for (const [key, releaseRadii] of Object.entries(TILE_RELEASE_RADII)) {
    const bodyId = asSceneBodyId(key);
    if (!isSurfaceTileBodyId(bodyId)) continue;
    const pose = view.bodyPose(bodyId);
    if (pose === null) continue;
    const [x, y, z] = pose.eyeRelBodyM;
    const distanceM = Math.hypot(x, y, z);
    const { surface } = findByIdOrThrow(SCENE_CELESTIAL_BODIES, bodyId, 'surfaceTileOverOf');
    if (distanceM >= nearestM || distanceM > releaseRadii * surface.datumRadiusM) {
      continue;
    }
    nearestM = distanceM;
    over = { bodyId, camPosLocalM: pose.eyeRelBodyM };
  }
  return over;
}
