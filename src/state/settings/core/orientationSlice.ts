/**
 * orientation — which pole the camera calls "up" (world positions never move:
 * J2000 always). Primitive state: Immer can't track a mutation on a string
 * draft, so the reducer RETURNS the new value instead of writing one.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_ORIENTATION } from '../../../data/defaults';
import type { OrientationFrameId } from '../../../@types/camera/OrientationFrameId';

const initialState: OrientationFrameId = DEFAULT_ORIENTATION;

export const orientationSlice = createSlice({
  name: 'settings/orientation',
  reducerPath: 'orientation',
  initialState,
  reducers: {
    setOrientation: (_orientation, action: PayloadAction<OrientationFrameId>) => action.payload,
  },
});

export const { setOrientation } = orientationSlice.actions;
