/**
 * filaments — the filament-skeleton overlay Layer's settings cluster: the
 * master toggle + intensity scale, and the reducers that write them.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';

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
