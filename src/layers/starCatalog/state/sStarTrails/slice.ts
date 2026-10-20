/** sStarTrails — the starCatalog Layer's S-star trail overlay switch, independent of orbitTrails. */

import { createSlice } from '@reduxjs/toolkit';

import { initialState } from './initialState';

export const sStarTrailsSlice = createSlice({
  name: 'settings/sStarTrails',
  reducerPath: 'sStarTrails',
  initialState,
  // No reducer: `setVisibility` writes the switch, the only field.
  reducers: {},
});
