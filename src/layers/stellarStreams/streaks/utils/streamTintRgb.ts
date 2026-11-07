import type { Vec3 } from '../../../../@types/math/Vec3';
import { lerp } from '../../../../utils/math/lerp';
import { starTintFromBpRp } from '../../../../utils/color/starTintFromBpRp';
import { STREAM_BP_RP_RANGE } from '../data/stellarStreamColours.constants';

/** The streak colour at `colourT`, scaled so its brightest channel is 1: dim tints stay legible as text. */
export function streamTintRgb(colourT: number): Vec3 {
  const rgb = starTintFromBpRp(lerp(STREAM_BP_RP_RANGE[0], STREAM_BP_RP_RANGE[1], colourT));
  const peak = Math.max(...rgb);
  return [rgb[0] / peak, rgb[1] / peak, rgb[2] / peak];
}
