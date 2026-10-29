/**
 * satellites — the Earth-satellite points' settings cluster: the master switch and one per class.
 * The Settings section writes both through the generic `setVisibility`, so no reducer of its own.
 */
import { createSlice } from '@reduxjs/toolkit';

import { initialState } from './initialState';

export const satellitesSlice = createSlice({
  name: 'settings/satellites',
  reducerPath: 'satellites',
  initialState,
  reducers: {},
});
