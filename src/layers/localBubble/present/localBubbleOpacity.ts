/**
 * localBubbleOpacity — the shell's visible opacity: the distance window ×
 * the toggle fade row's opacity × the intensity slider.
 */

import { fadeWindow } from '../../../utils/math/fadeWindow';
import { clampLocalBubbleIntensity } from '../../../utils/clampLocalBubbleIntensity';
import { SCALE_FADE_BANDS } from '../../../services/engine/presentation/scaleFadeBands';

export function localBubbleOpacity(
  camDistMpc: number,
  fadeAlpha: number,
  intensity: number,
): number {
  return (
    fadeWindow([SCALE_FADE_BANDS.localBubble, SCALE_FADE_BANDS.localBubbleRecede], camDistMpc) *
    fadeAlpha *
    clampLocalBubbleIntensity(intensity)
  );
}
