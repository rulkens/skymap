/**
 * antique — the engraved-atlas look. Boots from the `?antique` URL gate
 * so a deep link opens straight into it; the toggle dispatches `setAntiqueEnabled`.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { AntiqueSettings } from '../../../@types/settings/AntiqueSettings';
import type { AntiqueTuning } from '../../../@types/settings/AntiqueTuning';
import { ANTIQUE_TUNING_DEFAULTS } from '../../../data/rendering/antiqueTuning';
import { hasUrlGate } from '../../../utils/url/hasUrlGate';

const initialState: AntiqueSettings = {
  enabled: hasUrlGate('antique'),
  tuning: ANTIQUE_TUNING_DEFAULTS,
};

export const antiqueSlice = createSlice({
  name: 'settings/antique',
  reducerPath: 'antique',
  initialState,
  reducers: {
    setAntiqueEnabled: (antique, action: PayloadAction<boolean>) => {
      antique.enabled = action.payload;
    },
    setAntiqueTuning: (antique, action: PayloadAction<Partial<AntiqueTuning>>) => {
      antique.tuning = { ...antique.tuning, ...action.payload };
    },
    resetAntiqueTuning: (antique) => {
      antique.tuning = ANTIQUE_TUNING_DEFAULTS;
    },
  },
});

export const { setAntiqueEnabled, setAntiqueTuning, resetAntiqueTuning } = antiqueSlice.actions;
