/** cosmicHorizon — the horizon shell's settings cluster: the visibility toggle. */

import { createSlice } from '@reduxjs/toolkit';

import { initialState } from './initialState';

export const cosmicHorizonSlice = createSlice({
  name: 'settings/cosmicHorizon',
  reducerPath: 'cosmicHorizon',
  initialState,
  // No reducer: `setVisibility` writes the switch, the only field.
  reducers: {},
});
