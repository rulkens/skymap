import type { Vec3 } from '../../@types/math/Vec3';

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

/** The Rec.709 luminance of a linear-RGB colour. */
export function rec709Luminance([r, g, b]: Readonly<Vec3>): number {
  return LUMA_R * r + LUMA_G * g + LUMA_B * b;
}
