/** asteroidTuning: the asteroids Layer's DebugPanel tint per class, brightness and dot shape. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { AsteroidTuningSliderKey } from '../../@types/AsteroidTuningSliderKey';

export const asteroidTuningSlice = createSlice({
  name: 'settings/asteroidTuning',
  reducerPath: 'asteroidTuning',
  initialState,
  reducers: {
    setAsteroidColor: (tuning, action: PayloadAction<{ cls: AsteroidClass; color: Vec3 }>) => {
      tuning.colors[action.payload.cls] = action.payload.color;
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

export const { setAsteroidColor, setAsteroidSlider, resetAsteroidTuning } =
  asteroidTuningSlice.actions;
