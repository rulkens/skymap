/** constellations — the constellation stick-figure overlay Layer's settings cluster. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import type { ConstellationsSettings } from '../../../@types/settings/ConstellationsSettings';

// Constellation stick-figure overlay, read from the registry constellations
// row (same pattern as `filaments`) so that entry stays the single source of
// truth for the default-visible gate + intensity. The one `enabled` toggle
// governs both the lines and their name captions.
const initialState: ConstellationsSettings = {
  enabled: SOURCE_REGISTRY[Source.Constellations].visible,
  intensity: SOURCE_REGISTRY[Source.Constellations].intensity,
};

export const constellationsSlice = createSlice({
  name: 'settings/constellations',
  reducerPath: 'constellations',
  initialState,
  reducers: {
    setConstellationsEnabled: (constellations, action: PayloadAction<boolean>) => {
      constellations.enabled = action.payload;
    },
    setConstellationIntensity: (constellations, action: PayloadAction<number>) => {
      constellations.intensity = action.payload;
    },
  },
});

export const { setConstellationsEnabled, setConstellationIntensity } = constellationsSlice.actions;
