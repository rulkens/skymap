/**
 * bias — the galaxy-catalog Layer's Malmquist-correction cluster: which
 * correction the point vertex stage applies, and the volume-limited cut-off it
 * reads. `frame`'s reconcile bakes on a mode change.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { BiasMode } from '../../../../@types/data/galaxyCatalog/BiasMode';

export const biasSlice = createSlice({
  name: 'settings/bias',
  reducerPath: 'bias',
  initialState,
  reducers: {
    setBiasMode: (bias, action: PayloadAction<BiasMode>) => {
      bias.mode = action.payload;
    },
    setAbsMagLimit: (bias, action: PayloadAction<number>) => {
      bias.absMagLimit = action.payload;
    },
  },
});

export const { setBiasMode, setAbsMagLimit } = biasSlice.actions;
