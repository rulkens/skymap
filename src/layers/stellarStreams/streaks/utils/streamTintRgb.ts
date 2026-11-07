import type { Vec3 } from '../../../../@types/math/Vec3';
import { lerpVec3 } from '../../../../utils/math/lerpVec3';
import { STREAM_BHB_RGB, STREAM_GIANT_RGB } from '../data/stellarStreamColours.constants';

/** The streak colour at `colourT`, scaled so its brightest channel is 1: dim tints stay legible as text. */
export function streamTintRgb(colourT: number): Vec3 {
  const rgb = lerpVec3(STREAM_BHB_RGB, STREAM_GIANT_RGB, colourT);
  const peak = Math.max(...rgb);
  return [rgb[0] / peak, rgb[1] / peak, rgb[2] / peak];
}
