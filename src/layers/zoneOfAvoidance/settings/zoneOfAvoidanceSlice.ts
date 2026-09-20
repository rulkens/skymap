/**
 * zoneOfAvoidance — the Zone-of-Avoidance singleton-overlay Layer's settings
 * cluster: the visibility toggle plus the band's look knobs, and the
 * reducers that write them.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_ZONE_OF_AVOIDANCE_ENABLED, DEFAULT_ZONE_OF_AVOIDANCE_TUNING } from './defaults';
import type { ZoneOfAvoidanceSettings } from '../../../@types/settings/ZoneOfAvoidanceSettings';
import type { ZoneOfAvoidanceTuning } from '../../../@types/settings/ZoneOfAvoidanceTuning';

// Zone of Avoidance is a singleton overlay layer like `milkyWay`: one
// visibility toggle (band + lettering) plus the band's look knobs, read
// from `DEFAULT_ZONE_OF_AVOIDANCE_TUNING`.
const initialState: ZoneOfAvoidanceSettings = {
  enabled: DEFAULT_ZONE_OF_AVOIDANCE_ENABLED,
  ...DEFAULT_ZONE_OF_AVOIDANCE_TUNING,
};

export const zoneOfAvoidanceSlice = createSlice({
  name: 'settings/zoneOfAvoidance',
  reducerPath: 'zoneOfAvoidance',
  initialState,
  reducers: {
    setZoneOfAvoidanceEnabled: (zoneOfAvoidance, action: PayloadAction<boolean>) => {
      zoneOfAvoidance.enabled = action.payload;
    },
    // Band look knobs, patched leaf-by-leaf — the same visibility/tuning split
    // `setMilkyWayTuning` makes, so a knob patch can never flip `enabled`.
    setZoneOfAvoidanceTuning: (
      zoneOfAvoidance,
      action: PayloadAction<Partial<ZoneOfAvoidanceTuning>>,
    ) => {
      Object.assign(zoneOfAvoidance, action.payload);
    },
  },
});

export const { setZoneOfAvoidanceEnabled, setZoneOfAvoidanceTuning } = zoneOfAvoidanceSlice.actions;
