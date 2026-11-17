/**
 * The sky arm's wheel (look-around spec §4.2): a notch scales the lens by the zoom factor the
 * body arm would spend (`f > 1` widens), inside [LENS_MIN_DEG, LENS_MAX_DEG].
 * A clamped notch returns the clamp bound, so a lens already at the bound comes
 * back unchanged and the caller reads "declined" off equality.
 */

import { LENS_MAX_DEG } from '../../../../../../data/camera/lensMaxDeg';
import { LENS_MIN_DEG } from '../../../../../../data/camera/lensMinDeg';
import { degToRad } from '../../../../../../utils/math/degToRad';
import { spentZoomFactor } from '../../../input/utils/spentZoomFactor';

const LENS_MIN_RAD = degToRad(LENS_MIN_DEG);
const LENS_MAX_RAD = degToRad(LENS_MAX_DEG);

export function skyZoomedLens(lensRad: number, factor: number): number {
  const zoomed = lensRad * spentZoomFactor(factor);
  return Math.min(LENS_MAX_RAD, Math.max(LENS_MIN_RAD, zoomed));
}
