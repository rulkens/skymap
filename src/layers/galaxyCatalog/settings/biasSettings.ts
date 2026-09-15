/**
 * bias — the galaxy-catalog Layer's Malmquist-correction cluster: which
 * correction the point vertex stage applies, and the volume-limited cut-off it
 * reads. `frame`'s reconcile bakes on a mode change.
 */

import type { PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_ABS_MAG_LIMIT, DEFAULT_BIAS_MODE } from '../../../data/defaults';
import type { BiasMode } from '../../../@types/data/galaxyCatalog/BiasMode';
import type { BiasSettings } from '../../../@types/settings/BiasSettings';
import type { LayerSettingsFragment } from '../../../@types/settings/LayerSettingsFragment';

// The -19 default is roughly where the SDSS spectroscopic main sample is
// volume-complete out to the galaxy catalog's flux limit — bright enough that
// nearly every catalog galaxy has a spectrum, dim enough to keep structure.
const initialState: BiasSettings = {
  mode: DEFAULT_BIAS_MODE,
  absMagLimit: DEFAULT_ABS_MAG_LIMIT,
};

export const biasSettingsFragment = {
  key: 'bias',
  initialState,
  reducers: {
    setBiasMode: (cluster: BiasSettings, action: PayloadAction<BiasMode>) => {
      cluster.mode = action.payload;
    },
    setAbsMagLimit: (cluster: BiasSettings, action: PayloadAction<number>) => {
      cluster.absMagLimit = action.payload;
    },
  },
} as const satisfies LayerSettingsFragment<'bias', BiasSettings>;
