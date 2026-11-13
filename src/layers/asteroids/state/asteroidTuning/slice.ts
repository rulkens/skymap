/** asteroidTuning: the asteroids Layer's DebugPanel look modes, tints, brightness and dot shape. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { AsteroidBeltRamp } from '../../@types/AsteroidBeltRamp';
import type { AsteroidColorBy } from '../../@types/AsteroidColorBy';
import type { AsteroidSizeBy } from '../../@types/AsteroidSizeBy';
import type { AsteroidTuningSliderKey } from '../../@types/AsteroidTuningSliderKey';

export const asteroidTuningSlice = createSlice({
  name: 'settings/asteroidTuning',
  reducerPath: 'asteroidTuning',
  initialState,
  reducers: {
    setAsteroidColorBy: (tuning, action: PayloadAction<AsteroidColorBy>) => {
      tuning.colorBy = action.payload;
    },
    setAsteroidSizeBy: (tuning, action: PayloadAction<AsteroidSizeBy>) => {
      tuning.sizeBy = action.payload;
    },
    setAsteroidColor: (tuning, action: PayloadAction<{ cls: AsteroidClass; color: Vec3 }>) => {
      tuning.colors[action.payload.cls] = action.payload.color;
    },
    setAsteroidBeltColor: (
      tuning,
      action: PayloadAction<{ end: keyof AsteroidBeltRamp; color: Vec3 }>,
    ) => {
      tuning.beltRamp[action.payload.end] = action.payload.color;
    },
    setAsteroidSlider: (
      tuning,
      action: PayloadAction<{ key: AsteroidTuningSliderKey; value: number }>,
    ) => {
      tuning[action.payload.key] = action.payload.value;
    },
    resetAsteroidTuning: () => initialState,
  },
});

export const {
  setAsteroidColorBy,
  setAsteroidSizeBy,
  setAsteroidColor,
  setAsteroidBeltColor,
  setAsteroidSlider,
  resetAsteroidTuning,
} = asteroidTuningSlice.actions;
