/**
 * clampedAxisCover — one canvas axis's two insets as fractions of its extent,
 * scaled down together so they cover at most `MAX_COVERED_FRACTION`. Scaling
 * both keeps their ratio, so a clamped cover still shifts the right way.
 */

import { MAX_COVERED_FRACTION } from '../../../../../data/camera/maxCoveredFraction';

export function clampedAxisCover(
  nearPx: number,
  farPx: number,
  extentPx: number,
): readonly [number, number] {
  const near = nearPx / extentPx;
  const far = farPx / extentPx;
  const covered = near + far;
  if (covered <= MAX_COVERED_FRACTION) return [near, far];
  const scale = MAX_COVERED_FRACTION / covered;
  return [near * scale, far * scale];
}
