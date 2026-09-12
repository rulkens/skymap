/** orbitTrails — the body Layer's near-field Keplerian orbit-trails singleton overlay. */

import type { PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_ORBIT_TRAILS_ENABLED } from '../../../data/defaults';
import type { LayerSettingsFragment } from '../../../@types/settings/LayerSettingsFragment';
import type { OrbitTrailsSettings } from '../../../@types/settings/OrbitTrailsSettings';

// Orbit-trails singleton overlay: the master gate on the near-field Keplerian
// orbit trails, defaulting on (the trails are part of the baseline
// solar-system scene). A flat `enabled` field like `milkyWay` / `filaments`.
const initialState: OrbitTrailsSettings = {
  enabled: DEFAULT_ORBIT_TRAILS_ENABLED,
};

export const orbitTrailsSettingsFragment = {
  key: 'orbitTrails',
  initialState,
  reducers: {
    // Singleton-overlay master gate on the near-field Keplerian orbit trails,
    // its own single writer (like setMilkyWayEnabled / setFilamentsEnabled).
    setOrbitTrailsEnabled: (cluster: OrbitTrailsSettings, action: PayloadAction<boolean>) => {
      cluster.enabled = action.payload;
    },
  },
} as const satisfies LayerSettingsFragment<'orbitTrails', OrbitTrailsSettings>;
