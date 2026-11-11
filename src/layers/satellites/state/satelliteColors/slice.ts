/** satelliteColors: the satellites Layer's DebugPanel tint per group. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { SatelliteProfileId } from '../../points/@types/SatelliteProfileId';

export const satelliteColorsSlice = createSlice({
  name: 'settings/satelliteColors',
  reducerPath: 'satelliteColors',
  initialState,
  reducers: {
    setSatelliteColor: (colors, action: PayloadAction<{ id: SatelliteProfileId; color: Vec3 }>) => {
      colors[action.payload.id] = action.payload.color;
    },
    resetSatelliteColors: () => initialState,
  },
});

export const { setSatelliteColor, resetSatelliteColors } = satelliteColorsSlice.actions;
