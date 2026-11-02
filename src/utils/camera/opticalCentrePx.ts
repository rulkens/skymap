/**
 * opticalCentrePx — the CSS pixel (y-down) the view axis passes through: where
 * the tangent window crosses zero. The canvas centre for a symmetric frustum.
 */

import type { ViewFrustum } from '../../@types/camera/ViewFrustum';
import type { Vec2 } from '../../@types/math/Vec2';

export function opticalCentrePx(frustum: ViewFrustum, viewportPx: Readonly<Vec2>): Vec2 {
  const { tanLeft, tanRight, tanDown, tanUp } = frustum;
  return [
    (-tanLeft / (tanRight - tanLeft)) * viewportPx[0],
    (tanUp / (tanUp - tanDown)) * viewportPx[1],
  ];
}
