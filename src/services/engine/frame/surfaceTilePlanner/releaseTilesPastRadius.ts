/**
 * releaseTilesPastRadius — drops the tile atlases once the camera is far enough
 * past the engaged body that its globe texture has unloaded too.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { SurfaceTileSubsystem } from '../../../../@types/engine/subsystems/SurfaceTileSubsystem';
import { pastTextureReleaseRadius } from '../pastTextureReleaseRadius';

// A pull-back keeps the tile atlases (~324 MB) for a quick re-engage; past twice
// the body's texture load radius its globe map unloads too, and so do they.
// Every view shares the frame camera, so the first view's pose stands for all.
export function releaseTilesPastRadius(
  tiles: SurfaceTileSubsystem,
  views: readonly FrameView[],
): void {
  const engagedTileBody = tiles.engagedBodyId();
  const poseView = views[0];
  if (engagedTileBody === null || poseView === undefined) return;
  const body = poseView.snapshot.bodyStates.get(engagedTileBody);
  if (
    body !== undefined &&
    pastTextureReleaseRadius(engagedTileBody, poseView.drawCamPos, body.positionMpc)
  )
    tiles.release();
}
