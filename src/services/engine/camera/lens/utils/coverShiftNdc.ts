/**
 * coverShiftNdc — where the optical axis sits, in NDC (y up), so it passes
 * through the centre of the canvas minus its covers. `canvasPx` is CSS px,
 * the unit the covers are measured in.
 */

import type { InsetsPx } from '../../../../../@types/layout/InsetsPx';
import type { Vec2 } from '../../../../../@types/math/Vec2';
import { clampedAxisCover } from './clampedAxisCover';

export function coverShiftNdc(insets: InsetsPx, canvasPx: Readonly<Vec2>): Vec2 {
  const [left, right] = clampedAxisCover(insets.left, insets.right, canvasPx[0]);
  const [bottom, top] = clampedAxisCover(insets.bottom, insets.top, canvasPx[1]);
  return [left - right, bottom - top];
}
