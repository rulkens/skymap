/**
 * bloom — the bloom post-pass knobs. `enabled` is read at frame-program BUILD:
 * it changes the pass shape, not just a uniform.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import {
  DEFAULT_BLOOM_ENABLED,
  DEFAULT_BLOOM_STRENGTH,
  DEFAULT_BLOOM_THRESHOLD,
} from '../../../data/defaults';
import type { CoreSettingsState } from '../../../@types/settings/CoreSettingsState';

const initialState: CoreSettingsState['bloom'] = {
  enabled: DEFAULT_BLOOM_ENABLED,
  strength: DEFAULT_BLOOM_STRENGTH,
  threshold: DEFAULT_BLOOM_THRESHOLD,
};

export const bloomSlice = createSlice({
  name: 'settings/bloom',
  reducerPath: 'bloom',
  initialState,
  reducers: {
    setBloomEnabled: (bloom, action: PayloadAction<boolean>) => {
      bloom.enabled = action.payload;
    },
    setBloomStrength: (bloom, action: PayloadAction<number>) => {
      bloom.strength = action.payload;
    },
    setBloomThreshold: (bloom, action: PayloadAction<number>) => {
      bloom.threshold = action.payload;
    },
  },
});

export const { setBloomEnabled, setBloomStrength, setBloomThreshold } = bloomSlice.actions;
