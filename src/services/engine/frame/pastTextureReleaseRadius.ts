/**
 * pastTextureReleaseRadius — whether the camera has left a body's texture
 * hysteresis band: demanded inside `loadRadiusMpc`, released past twice it, so a
 * camera dithering at one edge cannot thrash a multi-MB load/free cycle. Shared
 * by the body-texture rows and the surface-tile atlases, which go with them.
 */

import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../../@types/data/RingTextureId';
import type { Vec3 } from '../../../@types/math/Vec3';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { loadRadiusMpc } from './bodyTextureLoadRadius';

export function pastTextureReleaseRadius(
  id: BodyTextureId | RingTextureId,
  cameraPosMpc: Readonly<Vec3>,
  bodyPosMpc: Readonly<Vec3>,
): boolean {
  return distanceMpc(cameraPosMpc, bodyPosMpc) > 2 * loadRadiusMpc(id);
}
