/**
 * Build the look-only fields a volume's settings row shares with every
 * other field of its kind, from its own source row. `enabled` and
 * `intensity` are the caller's to set — they're boot-state decisions the
 * owning Layer's `initialState` literal makes, not asset presentation.
 */

import { SCALE_FADE_BANDS } from '../../../services/engine/presentation/scaleFadeBands';
import type { CosmicWebDensitySourceEntry } from '../../../@types/data/volume/CosmicWebDensitySourceEntry';
import type { VolumeFieldSettings } from '../../../@types/settings/VolumeFieldSettings';

export function buildVolumeFieldSettings(
  entry: CosmicWebDensitySourceEntry,
): Omit<VolumeFieldSettings, 'enabled' | 'intensity'> {
  return {
    contrast: entry.contrast,
    densityScale: entry.densityScale,
    paletteId: entry.paletteId,
    trim: entry.trim,
    exposure: entry.exposure,
    bands: [SCALE_FADE_BANDS.surveyDeepZoom],
  };
}
