/**
 * scaleToLuminance — a linear-RGB colour's hue at a given Rec.709 luminance, channels free to pass 1.
 * Black has no hue to keep, so it comes back as grey at that luminance.
 */
import type { Vec3 } from '../../@types/math/Vec3';
import { rec709Luminance } from './rec709Luminance';

export function scaleToLuminance(rgb: Readonly<Vec3>, luminance: number): Vec3 {
  const own = rec709Luminance(rgb);
  if (own <= 0) return [luminance, luminance, luminance];
  const k = luminance / own;
  return [rgb[0] * k, rgb[1] * k, rgb[2] * k];
}
