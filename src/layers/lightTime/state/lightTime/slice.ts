/** lightTime — the light-time spheres guide's settings cluster: the visibility toggle. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';

export const lightTimeSlice = createSlice({
  name: 'settings/lightTime',
  reducerPath: 'lightTime',
  initialState,
  reducers: {
    setLightTimeEnabled: (lightTime, action: PayloadAction<boolean>) => {
      lightTime.enabled = action.payload;
    },
  },
});

export const { setLightTimeEnabled } = lightTimeSlice.actions;
