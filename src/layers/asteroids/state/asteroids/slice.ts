/**
 * asteroids — the minor-planet points' settings cluster. The switches go through the generic
 * `setVisibility`; brightness is the one field with a reducer of its own.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';

export const asteroidsSlice = createSlice({
  name: 'settings/asteroids',
  reducerPath: 'asteroids',
  initialState,
  reducers: {
    setAsteroidBrightness: (asteroids, action: PayloadAction<number>) => {
      asteroids.brightness = action.payload;
    },
  },
});

export const { setAsteroidBrightness } = asteroidsSlice.actions;
