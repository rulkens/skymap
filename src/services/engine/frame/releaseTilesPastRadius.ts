/**
 * releaseTilesPastRadius — drops the tile atlases once the camera is far enough
 * past the engaged body that its globe texture has unloaded too.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { SurfaceTileSubsystem } from '../../../@types/engine/subsystems/SurfaceTileSubsystem';
import { pastTextureReleaseRadius } from './pastTextureReleaseRadius';
import { sceneBodyStates } from './sceneBodyStates';

// A pull-back keeps the tile atlases (~324 MB) for a quick re-engage; past twice
// the body's texture load radius its globe map unloads too, and so do they.
// Every view shares the frame camera, so the first view's pose stands for all.
export function releaseTilesPastRadius(
  tiles: SurfaceTileSubsystem,
  views: readonly FrameView[],
  state: PassState,
): void {
  const engagedTileBody = tiles.engagedBodyId();
  const poseView = views[0];
  if (engagedTileBody === null || poseView === undefined) return;
  const body = sceneBodyStates(state, poseView).get(engagedTileBody);
  if (
    body !== undefined &&
    pastTextureReleaseRadius(engagedTileBody, poseView.drawCamPos, body.positionMpc)
  )
    tiles.release();
}
