/** missionTrails — the missions Layer's trail overlay switch, independent of orbitTrails. */

import { createSlice } from '@reduxjs/toolkit';

import { initialState } from './initialState';

export const missionTrailsSlice = createSlice({
  name: 'settings/missionTrails',
  reducerPath: 'missionTrails',
  initialState,
  // No reducer: `setVisibility` writes the switch, the only field.
  reducers: {},
});
