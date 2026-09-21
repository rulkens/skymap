/** constellations — the constellation stick-figure overlay Layer's settings cluster. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';

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
