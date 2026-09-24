/** blackHoleLensingTuning — the blackHoles Layer's lens-pass DebugPanel tuning cluster. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { SgrAStarLensingTuning } from '../../@types/SgrAStarLensingTuning';

export const blackHoleLensingTuningSlice = createSlice({
  name: 'settings/blackHoleLensingTuning',
  reducerPath: 'blackHoleLensingTuning',
  initialState,
  reducers: {
    // Leaf-by-leaf patch, no visibility axis to protect (this cluster is
    // pure knobs, not a singleton overlay).
    setBlackHoleLensingTuning: (cluster, action: PayloadAction<Partial<SgrAStarLensingTuning>>) => {
      Object.assign(cluster, action.payload);
    },
  },
});

export const { setBlackHoleLensingTuning } = blackHoleLensingTuningSlice.actions;
