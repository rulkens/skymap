import type { Vec3 } from '../math/Vec3';

/** ColourGrade — a `writeBodyTier` treatment step and `delightedImagerySource`'s
 *  post-delight pass, applied to sRGB 0..1 in this order: exposure, then
 *  `gain`+`offset`, then `contrast` about 0.5, then `saturation` about
 *  Rec.709 luma, then `gamma` (`v^(1/gamma)`) after clamping to [0,1]. */
export type ColourGrade = {
  readonly ev: number;
  readonly contrast: number;
  readonly gamma: number;
  readonly saturation: number;
  readonly gain: Vec3;
  readonly offset: Vec3;
};
