/**
 * photoPoseFromStacItem — one skråfoto STAC item's exterior + interior
 * orientation as a `PhotoPose` describing the JPEG `fetchSkraafoto` actually
 * wrote: `window` is the crop and downsample it applied, so the principal
 * point moves with the crop origin and every length scales with it.
 *
 * `positionM` arrives already converted (`poses/topocentricPositionsM.ts`) so
 * this stays a pure function. The group's `headingDeg` is deliberately not
 * applied: `topocentricPositionsM` ignores it too, and the two must agree.
 */
import { frameProjection } from './frameProjection';
import { frameWindowOutputPx, type FrameWindow } from './frameWindow';
import { matrixToQuaternion } from '../../../src/utils/math/matrixToQuaternion';
import type { GroupAnchor } from '../../scene-workbench/@types/GroupAnchor';
import type { PhotoPose } from '../../scene-workbench/@types/PhotoPose';
import type { SkraafotoStacItem } from '../@types/SkraafotoStacItem';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

export function photoPoseFromStacItem(
  item: SkraafotoStacItem,
  anchor: GroupAnchor,
  positionM: Vec3,
  window: FrameWindow,
): PhotoPose {
  const projection = frameProjection(item, anchor);
  const [imageWidthPx, imageHeightPx] = frameWindowOutputPx(window);

  // PhotoPose.rotation is the inverse (group ← camera) and matrixToQuaternion
  // reads column-major, so the camera ← group rows are already its columns.
  const groupFromCam: Mat3 = [
    ...projection.camFromGroup[0],
    ...projection.camFromGroup[1],
    ...projection.camFromGroup[2],
  ];

  return {
    id: item.id,
    positionM,
    rotation: matrixToQuaternion(groupFromCam),
    focalLengthPx: projection.focalLengthPx * window.scale,
    principalPointPx: [
      (projection.principalPointPx[0] - window.x0) * window.scale,
      (projection.principalPointPx[1] - window.y0) * window.scale,
    ],
    imageWidthPx,
    imageHeightPx,
    imageUrl: `${item.id}.jpg`,
  };
}
