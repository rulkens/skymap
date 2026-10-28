import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { SkyGridFrame } from '../../../../@types/settings/SkyGridFrame';

export const skyGridSlice = createSlice({
  name: 'settings/skyGrid',
  reducerPath: 'skyGrid',
  initialState,
  reducers: {
    setSkyGridEnabled: (skyGrid, action: PayloadAction<boolean>) => {
      skyGrid.enabled = action.payload;
    },
    setSkyGridFrame: (skyGrid, action: PayloadAction<{ frame: SkyGridFrame; on: boolean }>) => {
      skyGrid.frames[action.payload.frame] = action.payload.on;
    },
  },
});

export const { setSkyGridEnabled, setSkyGridFrame } = skyGridSlice.actions;
