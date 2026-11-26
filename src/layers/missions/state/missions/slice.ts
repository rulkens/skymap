/** missions — the missions Layer's craft caption switch. */

import { createSlice } from '@reduxjs/toolkit';

import { initialState } from './initialState';

export const missionsSlice = createSlice({
  name: 'settings/missions',
  reducerPath: 'missions',
  initialState,
  // No reducer: `setVisibility` writes the caption switch.
  reducers: {},
});
