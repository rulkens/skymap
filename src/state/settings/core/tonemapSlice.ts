/** tonemap — post-exposure and the tone curve applied on top of it. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_EXPOSURE, DEFAULT_TONE_MAP_CURVE } from '../../../data/defaults';
import type { TonemapSettings } from '../../../@types/settings/TonemapSettings';
import type { ToneMapCurve } from '../../../@types/data/ToneMapCurve';

const initialState: TonemapSettings = {
  exposure: DEFAULT_EXPOSURE,
  curve: DEFAULT_TONE_MAP_CURVE,
};

export const tonemapSlice = createSlice({
  name: 'settings/tonemap',
  reducerPath: 'tonemap',
  initialState,
  reducers: {
    setExposure: (tonemap, action: PayloadAction<number>) => {
      tonemap.exposure = action.payload;
    },
    setToneMapCurve: (tonemap, action: PayloadAction<ToneMapCurve>) => {
      tonemap.curve = action.payload;
    },
  },
});

export const { setExposure, setToneMapCurve } = tonemapSlice.actions;
