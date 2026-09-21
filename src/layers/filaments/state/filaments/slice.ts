/**
 * filaments — the filament-skeleton overlay Layer's settings cluster: the
 * master toggle + intensity scale, and the reducers that write them.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { Source, SOURCE_REGISTRY } from '../../../../data/sources';
import type { FilamentsSettings } from '../../../../@types/settings/FilamentsSettings';

const initialState: FilamentsSettings = {
  enabled: SOURCE_REGISTRY[Source.Filaments].visible,
  intensity: SOURCE_REGISTRY[Source.Filaments].intensity,
};

export const filamentsSlice = createSlice({
  name: 'settings/filaments',
  reducerPath: 'filaments',
  initialState,
  reducers: {
    setFilamentsEnabled: (filaments, action: PayloadAction<boolean>) => {
      filaments.enabled = action.payload;
    },
    setFilamentIntensity: (filaments, action: PayloadAction<number>) => {
      filaments.intensity = action.payload;
    },
  },
});

export const { setFilamentsEnabled, setFilamentIntensity } = filamentsSlice.actions;
