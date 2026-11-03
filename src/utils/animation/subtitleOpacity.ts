/**
 * subtitleOpacity — a subtitle line's opacity at dwell time `tSec`: ramps in
 * over SUBTITLE_FADE_SEC from its slice start and out over the same span to its
 * end. `stepped` (reduced motion) drops the ramps: 1 inside the slice, else 0.
 */

import { SUBTITLE_FADE_SEC } from '../../data/animation/subtitleTiming';

export function subtitleOpacity(
  slice: { readonly startSec: number; readonly endSec: number },
  tSec: number,
  stepped: boolean,
): number {
  const { startSec, endSec } = slice;
  if (tSec < startSec || tSec >= endSec) return 0;
  if (stepped) return 1;
  const fadeIn = (tSec - startSec) / SUBTITLE_FADE_SEC;
  const fadeOut = (endSec - tSec) / SUBTITLE_FADE_SEC;
  return Math.min(1, fadeIn, fadeOut);
}
