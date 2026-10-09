import { linearRgbToHex } from '../../color/linearRgbToHex';
import type { Vec3 } from '../../../@types/math/Vec3';

/**
 * A trail's HDR tint (channels ≲ 0.5, linear) as a CSS colour: scaled so its brightest
 * channel is full, so the lane reads as the same hue the trail is drawn in.
 */
export function laneColorCss(trailColor: Readonly<Vec3>): string {
  const peak = Math.max(...trailColor);
  return linearRgbToHex([trailColor[0] / peak, trailColor[1] / peak, trailColor[2] / peak]);
}
