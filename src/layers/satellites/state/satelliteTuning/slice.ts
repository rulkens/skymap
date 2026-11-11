/** satelliteTuning: the satellites Layer's DebugPanel tint per group and ambient light. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { SatelliteProfileId } from '../../points/@types/SatelliteProfileId';

export const satelliteTuningSlice = createSlice({
  name: 'settings/satelliteTuning',
  reducerPath: 'satelliteTuning',
  initialState,
  reducers: {
    // A new `colors` object per edit: the planner rewrites the profile table on its reference.
    setSatelliteColor: (tuning, action: PayloadAction<{ id: SatelliteProfileId; color: Vec3 }>) => {
      tuning.colors[action.payload.id] = action.payload.color;
    },
    setSatelliteAmbient: (tuning, action: PayloadAction<number>) => {
      tuning.ambient = action.payload;
    },
    resetSatelliteTuning: () => initialState,
  },
});

export const { setSatelliteColor, setSatelliteAmbient, resetSatelliteTuning } =
  satelliteTuningSlice.actions;
