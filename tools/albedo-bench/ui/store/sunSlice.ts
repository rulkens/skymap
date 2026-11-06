import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RenderLight } from '../../@types/RenderLight';
import type { SunMode } from '../../@types/SunMode';
import type { SunState } from '../../@types/SunState';

const initialState: SunState = {
  sunMode: 'fitted',
  manualAzDeg: 0,
  manualStrength: 1,
  lightOn: false,
  light: { azDeg: 315, elDeg: 45, roughness: 0.9, ambient: 0.08 },
};

export const sunSlice = createSlice({
  name: 'sun',
  initialState,
  reducers: {
    setSunMode: (state, action: PayloadAction<SunMode>) => {
      state.sunMode = action.payload;
    },
    setManualAzDeg: (state, action: PayloadAction<number>) => {
      state.manualAzDeg = action.payload;
    },
    setManualStrength: (state, action: PayloadAction<number>) => {
      state.manualStrength = action.payload;
    },
    setLightOn: (state, action: PayloadAction<boolean>) => {
      state.lightOn = action.payload;
    },
    setLight: (state, action: PayloadAction<RenderLight>) => {
      state.light = action.payload;
    },
  },
});

export const { setSunMode, setManualAzDeg, setManualStrength, setLightOn, setLight } =
  sunSlice.actions;
