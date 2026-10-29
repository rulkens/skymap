/**
 * satellites — the Earth-satellite points' settings cluster: the show toggle, which the
 * "Labels & guides" row writes through the show entry (no reducer of its own yet).
 */
import { createSlice } from '@reduxjs/toolkit';

import { initialState } from './initialState';

export const satellitesSlice = createSlice({
  name: 'settings/satellites',
  reducerPath: 'satellites',
  initialState,
  reducers: {},
});
