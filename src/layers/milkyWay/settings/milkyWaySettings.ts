/** milkyWay — the Milky-Way singleton-overlay Layer's settings cluster. */

import type { PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_MILKY_WAY_ENABLED, DEFAULT_MILKY_WAY_LABEL_ENABLED } from '../../../data/defaults';
// The Milky-Way star-cloud look knobs are owned by the renderer's calibration
// module, so seed them from there rather than restating six numbers here.
import { MILKY_WAY_TUNING_DEFAULTS } from '../../../services/engine/galaxyGenerator/v1/milkyWayCalibration';
import type { LayerSettingsFragment } from '../../../@types/settings/LayerSettingsFragment';
import type { MilkyWaySettings } from '../../../@types/settings/MilkyWaySettings';
import type { MilkyWayTuning } from '../../../@types/settings/MilkyWayTuning';

// Milky Way is a singleton overlay layer: the two visibility axes plus the
// star-cloud look knobs all live here. The knobs spread in from
// `MILKY_WAY_TUNING_DEFAULTS`, which stays their single source of truth for
// where they start (the DebugPanel sliders own them from then on).
const initialState: MilkyWaySettings = {
  enabled: DEFAULT_MILKY_WAY_ENABLED,
  labelEnabled: DEFAULT_MILKY_WAY_LABEL_ENABLED,
  ...MILKY_WAY_TUNING_DEFAULTS,
};

export const milkyWaySettingsFragment = {
  key: 'milkyWay',
  initialState,
  reducers: {
    setMilkyWayEnabled: (cluster: MilkyWaySettings, action: PayloadAction<boolean>) => {
      cluster.enabled = action.payload;
    },
    setMilkyWayLabelEnabled: (cluster: MilkyWaySettings, action: PayloadAction<boolean>) => {
      cluster.labelEnabled = action.payload;
    },
    // Star-cloud look knobs, patched leaf-by-leaf from the DebugPanel sliders.
    // The payload is `MilkyWayTuning`, not `MilkyWaySettings`, so the two
    // visibility axes keep their own single writers above and can never be
    // flipped by a knob patch — the same split `setFlow` makes.
    setMilkyWayTuning: (
      cluster: MilkyWaySettings,
      action: PayloadAction<Partial<MilkyWayTuning>>,
    ) => {
      Object.assign(cluster, action.payload);
    },
  },
} as const satisfies LayerSettingsFragment<'milkyWay', MilkyWaySettings>;
