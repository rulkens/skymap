/** sgrAStarLensingTuning — the body Layer's Sgr A* lens-pass DebugPanel tuning cluster. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_SGR_A_STAR_LENSING_TUNING } from '../defaults';
import type { SgrAStarLensingTuning } from '../../../../@types/settings/SgrAStarLensingTuning';

// The Sgr A* lens knobs; see `SgrAStarLensingTuning` for the tier
// breakdown and which module owns each default.
const initialState: SgrAStarLensingTuning = { ...DEFAULT_SGR_A_STAR_LENSING_TUNING };

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
