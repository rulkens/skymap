/**
 * zoneOfAvoidanceLayerOpacity — the ONE home for the zone-of-avoidance
 * overlay's opacity scalar: the composition of approach band × recede band ×
 * layer fade-registry opacity. The band fades IN as the Milky Way frames up
 * and back OUT once the Local Group is the subject — the guide is scoped to
 * the Milky-Way-context shot, not a permanent cosmic-scale fixture. Feeds
 * both the band and label draws, which share one fade toggle.
 */

import { fadeWindow } from '../../../utils/math/fadeWindow';
import { SCALE_FADE_BANDS } from './scaleFadeBands';

export function zoneOfAvoidanceLayerOpacity(camDistMpc: number, layerFadeOpacity: number): number {
  return (
    fadeWindow(
      [SCALE_FADE_BANDS.zoneOfAvoidance, SCALE_FADE_BANDS.zoneOfAvoidanceRecede],
      camDistMpc,
    ) * layerFadeOpacity
  );
}
