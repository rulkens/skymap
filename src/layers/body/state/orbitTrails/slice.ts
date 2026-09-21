/** orbitTrails — the body Layer's near-field Keplerian orbit-trails singleton overlay. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_ORBIT_TRAILS_ENABLED } from '../defaults';
import type { OrbitTrailsSettings } from '../../../../@types/settings/OrbitTrailsSettings';

// Orbit-trails singleton overlay: the master gate on the near-field Keplerian
// orbit trails, defaulting on (the trails are part of the baseline
// solar-system scene). A flat `enabled` field like `milkyWay` / `filaments`.
const initialState: OrbitTrailsSettings = {
  enabled: DEFAULT_ORBIT_TRAILS_ENABLED,
};

export const orbitTrailsSlice = createSlice({
  name: 'settings/orbitTrails',
  reducerPath: 'orbitTrails',
  initialState,
  reducers: {
    // Singleton-overlay master gate on the near-field Keplerian orbit trails,
    // its own single writer (like setMilkyWayEnabled / setFilamentsEnabled).
    setOrbitTrailsEnabled: (orbitTrails, action: PayloadAction<boolean>) => {
      orbitTrails.enabled = action.payload;
    },
  },
});

export const { setOrbitTrailsEnabled } = orbitTrailsSlice.actions;
