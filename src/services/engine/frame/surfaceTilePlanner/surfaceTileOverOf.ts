/**
 * surfaceTileOverOf — the tiling body the eye is over (`SurfaceTileOver`): the
 * nearest within twice its `engageDistanceM` for the frame's finest lens, by
 * the view's body pose alone, so with several in reach the nearer wins, never
 * the registry's first. Every view shares the frame's eye, so the first view's
 * pose stands for all; the lens is the finest view's, since any view can engage,
 * read at its corner: a wide lens magnifies its edges up to 1/cos²θ, so a body
 * there engages farther out than one at the centre.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { SurfaceTileOver } from '../../../../@types/engine/surfaceTiles/SurfaceTileOver';
import { SCENE_CELESTIAL_BODIES } from '../../../../data/bodies/sceneCelestialBodies';
import { SURFACE_TILE_REGISTRY } from '../../../../data/bodies/surfaceTileRegistry';
import { findByIdOrThrow } from '../../../../utils/object/findByIdOrThrow';
import { asSceneBodyId } from '../../../../utils/scene/asSceneBodyId';
import { isSurfaceTileBodyId } from '../../../../utils/surfaceTiles/isSurfaceTileBodyId';
import { engageDistanceM } from '../../../../utils/surfaceTiles/engageDistanceM';
import { frustumCornerMagnification } from '../../../../utils/camera/frustumCornerMagnification';

export function surfaceTileOverOf(views: readonly FrameView[]): SurfaceTileOver | null {
  const eyeView = views[0];
  if (eyeView === undefined) return null;
  const pxPerRad = Math.max(
    ...views.map((view) => view.drawPxPerRad * frustumCornerMagnification(view.frustum)),
  );
  let over: SurfaceTileOver | null = null;
  let nearestM = Infinity;
  for (const key of Object.keys(SURFACE_TILE_REGISTRY)) {
    const bodyId = asSceneBodyId(key);
    if (!isSurfaceTileBodyId(bodyId)) continue;
    const pose = eyeView.bodyPose(bodyId);
    if (pose === null) continue;
    const [x, y, z] = pose.eyeRelBodyM;
    const distanceM = Math.hypot(x, y, z);
    const { surface } = findByIdOrThrow(SCENE_CELESTIAL_BODIES, bodyId, 'surfaceTileOverOf');
    // Twice the engage distance: a release radius at it would engage and
    // release on alternate frames.
    const releaseM = 2 * engageDistanceM(surface.datumRadiusM, pxPerRad);
    if (distanceM >= nearestM || distanceM > releaseM) continue;
    nearestM = distanceM;
    over = { bodyId, camPosLocalM: pose.eyeRelBodyM };
  }
  return over;
}
