/** lightTime — the light-time spheres guide's settings cluster: the visibility toggle. */

import { createSlice } from '@reduxjs/toolkit';

import { initialState } from './initialState';

export const lightTimeSlice = createSlice({
  name: 'settings/lightTime',
  reducerPath: 'lightTime',
  initialState,
  // No reducer: `setVisibility` writes the switch, the only field.
  reducers: {},
});
