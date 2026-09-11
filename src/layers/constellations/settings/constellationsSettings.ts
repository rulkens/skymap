/**
 * constellations — the constellation stick-figure overlay Layer's settings
 * cluster: the master toggle + intensity scale, and the case reducers that
 * write them. `liftClusterReducers` re-bases those reducers onto the settings
 * root, so their action type strings stay `settings/<key>`.
 */

import type { PayloadAction } from '@reduxjs/toolkit';

import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import type { ConstellationsSettings } from '../../../@types/settings/ConstellationsSettings';
import type { LayerSettingsFragment } from '../../../@types/settings/LayerSettingsFragment';

export const constellationsSettingsFragment = {
  key: 'constellations',
  // Constellation stick-figure overlay, seeded from the registry constellations
  // row (same pattern as `filaments`) so that entry stays the single source of
  // truth for the default-visible gate + intensity. The one `enabled` toggle
  // governs both the lines and their name captions.
  seed: (): ConstellationsSettings => ({
    enabled: SOURCE_REGISTRY[Source.Constellations].visible,
    intensity: SOURCE_REGISTRY[Source.Constellations].intensity,
  }),
  reducers: {
    setConstellationsEnabled: (cluster: ConstellationsSettings, action: PayloadAction<boolean>) => {
      cluster.enabled = action.payload;
    },
    setConstellationIntensity: (cluster: ConstellationsSettings, action: PayloadAction<number>) => {
      cluster.intensity = action.payload;
    },
  },
} as const satisfies LayerSettingsFragment<'constellations', ConstellationsSettings>;
