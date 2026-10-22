/**
 * tileCamerasOf — each view's body-local tile camera, built in f64 from the view's
 * body pose and frustum: the x, y and w rows of a `body-m` slab's vp (`bodySlabRow`
 * builds it with the same `lookAt` and `frustumPerspectiveF64`) without reading a
 * slab. Near and far only set the z row, which `cutSurfaceTiles` never reads, so
 * the cut equals the slab-built one. Never the f32-narrowed `view.vp`.
 */

import { mat4d } from 'wgpu-matrix';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { SurfaceTileBodyId } from '../../../../@types/data/SurfaceTileBodyId';
import type { TileCamera } from '../../../../@types/scene/TileCamera';
import type { BodyId } from '../../../../@types/data/body/BodyId';
import { composeBodySlabMvp } from '../../../../utils/camera/composeBodySlabMvp';
import { frustumPerspectiveF64 } from '../../../../utils/camera/frustumPerspectiveF64';
import { MIN_NEAR_M } from '../../../../utils/camera/foregroundFrustum';

export function tileCamerasOf(
  views: readonly FrameView[],
  bodyId: SurfaceTileBodyId,
  radiusM: number,
): readonly TileCamera[] {
  return views.flatMap((view) => {
    const pose = view.bodyPose(bodyId as BodyId);
    if (pose === null) return [];
    const { basisM, eyeRelBodyM } = pose;
    const look = mat4d.lookAt(
      [0, 0, 0],
      [basisM[6], basisM[7], basisM[8]],
      [basisM[3], basisM[4], basisM[5]],
    );
    const vp = mat4d.multiply(
      frustumPerspectiveF64(view.frustum, MIN_NEAR_M, null),
      look,
    ) as Float64Array;
    return [
      {
        viewProjLocal: composeBodySlabMvp(vp, eyeRelBodyM, radiusM),
        viewportPx: [view.canvasSize.width, view.canvasSize.height],
      },
    ];
  });
}
