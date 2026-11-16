/**
 * The sky arm's look (look-around spec §4.1): one pixel turns the view by `fovY / heightPx`,
 * so the sky under the pointer follows it at every lens — dragging right turns
 * the eye left, dragging down looks up. The altitude stops at the zenith and
 * nadir; the azimuth stays free there, since the view still rolls about them.
 */

import type { SkyPose } from '../../../../../../@types/camera/pose/SkyPose';
import type { Vec2 } from '../../../../../../@types/math/Vec2';
import { wrapRad } from '../../../../../../utils/math/wrapRad';

const HALF_PI = Math.PI / 2;

export function skyLookedPose(
  pose: SkyPose,
  dragPx: Readonly<Vec2>,
  fovYRad: number,
  viewportHeightPx: number,
): SkyPose {
  const gain = fovYRad / viewportHeightPx;
  return {
    azimuthRad: wrapRad(pose.azimuthRad - dragPx[0] * gain),
    altitudeRad: Math.min(HALF_PI, Math.max(-HALF_PI, pose.altitudeRad + dragPx[1] * gain)),
  };
}
