/**
 * antique — the engraved-atlas look. Boots from the `?antique` URL gate
 * so a deep link opens straight into it; the toggle dispatches `setAntiqueEnabled`.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { AntiqueSettings } from '../../../@types/settings/AntiqueSettings';
import { hasUrlGate } from '../../../utils/url/hasUrlGate';

const initialState: AntiqueSettings = {
  enabled: hasUrlGate('antique'),
};

export const antiqueSlice = createSlice({
  name: 'settings/antique',
  reducerPath: 'antique',
  initialState,
  reducers: {
    setAntiqueEnabled: (antique, action: PayloadAction<boolean>) => {
      antique.enabled = action.payload;
    },
  },
});

export const { setAntiqueEnabled } = antiqueSlice.actions;
