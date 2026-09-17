/**
 * camera — the vertical FOV slider, in DEGREES; `runFrame` converts to
 * radians once.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_FOV_DEG } from '../../../data/defaults';
import type { CameraSettings } from '../../../@types/settings/CameraSettings';

const initialState: CameraSettings = {
  fovDeg: DEFAULT_FOV_DEG,
};

export const cameraSettingsSlice = createSlice({
  name: 'settings/camera',
  reducerPath: 'camera',
  initialState,
  reducers: {
    setFovDeg: (camera, action: PayloadAction<number>) => {
      camera.fovDeg = action.payload;
    },
  },
});

export const { setFovDeg } = cameraSettingsSlice.actions;
