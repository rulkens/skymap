/** blackHoles — the blackHoles Layer's per-hole caption toggles. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { BlackHoleId } from '../../../../@types/data/blackHole/BlackHoleId';
import type { BlackHolesSettings } from '../../../../@types/settings/BlackHolesSettings';

export const blackHolesSlice = createSlice({
  name: 'settings/blackHoles',
  reducerPath: 'blackHoles',
  initialState: initialState as BlackHolesSettings,
  reducers: {
    setBlackHoleLabelEnabled: (
      blackHoles,
      action: PayloadAction<{ id: BlackHoleId; enabled: boolean }>,
    ) => {
      blackHoles.items[action.payload.id] = { labelEnabled: action.payload.enabled };
    },
  },
});

export const { setBlackHoleLabelEnabled } = blackHolesSlice.actions;
