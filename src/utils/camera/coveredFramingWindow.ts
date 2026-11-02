/**
 * coveredFramingWindow — the uncovered rect as a framing window. The rect is
 * symmetric about the shifted axis, so two half-tangents describe it. Scales
 * by `1 − covered` rather than `(W − L − R) / W` so zero insets give
 * `lensFramingWindow` bit for bit.
 */

import type { FramingWindow } from '../../@types/camera/FramingWindow';
import type { InsetsPx } from '../../@types/layout/InsetsPx';
import type { Vec2 } from '../../@types/math/Vec2';
import { clampedAxisCover } from './clampedAxisCover';
import { lensFramingWindow } from './lensFramingWindow';

export function coveredFramingWindow(
  fovYRad: number,
  aspect: number,
  insets: InsetsPx,
  canvasPx: Readonly<Vec2>,
): FramingWindow {
  const lens = lensFramingWindow(fovYRad, aspect);
  const [left, right] = clampedAxisCover(insets.left, insets.right, canvasPx[0]);
  const [bottom, top] = clampedAxisCover(insets.bottom, insets.top, canvasPx[1]);
  return {
    tanHalfX: lens.tanHalfX * (1 - left - right),
    tanHalfY: lens.tanHalfY * (1 - bottom - top),
  };
}
