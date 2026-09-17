/**
 * bias — the galaxy-catalog Layer's Malmquist-correction cluster: which
 * correction the point vertex stage applies, and the volume-limited cut-off it
 * reads. `frame`'s reconcile bakes on a mode change.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_ABS_MAG_LIMIT, DEFAULT_BIAS_MODE } from '../../../data/defaults';
import type { BiasMode } from '../../../@types/data/galaxyCatalog/BiasMode';
import type { BiasSettings } from '../../../@types/settings/BiasSettings';

// The -19 default is roughly where the SDSS spectroscopic main sample is
// volume-complete out to the galaxy catalog's flux limit — bright enough that
// nearly every catalog galaxy has a spectrum, dim enough to keep structure.
const initialState: BiasSettings = {
  mode: DEFAULT_BIAS_MODE,
  absMagLimit: DEFAULT_ABS_MAG_LIMIT,
};

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
