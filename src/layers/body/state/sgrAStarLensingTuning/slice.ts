/** sgrAStarLensingTuning — the body Layer's Sgr A* lens-pass DebugPanel tuning cluster. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { SgrAStarLensingTuning } from '../../../../@types/settings/SgrAStarLensingTuning';

export const sgrAStarLensingTuningSlice = createSlice({
  name: 'settings/sgrAStarLensingTuning',
  reducerPath: 'sgrAStarLensingTuning',
  initialState,
  reducers: {
    // Leaf-by-leaf patch, no visibility axis to protect (this cluster is
    // pure knobs, not a singleton overlay).
    setSgrAStarLensingTuning: (cluster, action: PayloadAction<Partial<SgrAStarLensingTuning>>) => {
      Object.assign(cluster, action.payload);
    },
  },
});

export const { setSgrAStarLensingTuning } = sgrAStarLensingTuningSlice.actions;
