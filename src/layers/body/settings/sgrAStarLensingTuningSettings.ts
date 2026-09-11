/**
 * sgrAStarLensingTuning — the body Layer's Sgr A* lens-pass tuning cluster:
 * the DebugPanel knobs and the one case reducer that writes them.
 * `liftClusterReducers` re-bases that reducer onto the settings root, so its
 * action type string stays `settings/<key>`.
 */

import type { PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_SGR_A_STAR_LENSING_TUNING } from '../../../data/defaults';
import type { LayerSettingsFragment } from '../../../@types/settings/LayerSettingsFragment';
import type { SgrAStarLensingTuning } from '../../../@types/settings/SgrAStarLensingTuning';

export const sgrAStarLensingTuningSettingsFragment = {
  key: 'sgrAStarLensingTuning',
  // The Sgr A* lens knobs; see `SgrAStarLensingTuning` for the tier
  // breakdown and which module owns each default.
  seed: (): SgrAStarLensingTuning => DEFAULT_SGR_A_STAR_LENSING_TUNING,
  reducers: {
    // Leaf-by-leaf patch, no visibility axis to protect (this cluster is
    // pure knobs, not a singleton overlay).
    setSgrAStarLensingTuning: (
      cluster: SgrAStarLensingTuning,
      action: PayloadAction<Partial<SgrAStarLensingTuning>>,
    ) => {
      Object.assign(cluster, action.payload);
    },
  },
} as const satisfies LayerSettingsFragment<'sgrAStarLensingTuning', SgrAStarLensingTuning>;
