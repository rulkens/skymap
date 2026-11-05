/**
 * whitenColor — blend the rgb of a colour toward white, alpha untouched. A
 * blend, not a gain: label colours already sit near full value, where a gain
 * would only clip.
 */

import { lerp } from '../math/lerp';
import type { Vec4 } from '../../@types/math/Vec4';

export function whitenColor(color: Readonly<Vec4>, amount: number): Vec4 {
  return [
    lerp(color[0], 1, amount),
    lerp(color[1], 1, amount),
    lerp(color[2], 1, amount),
    color[3],
  ];
}
