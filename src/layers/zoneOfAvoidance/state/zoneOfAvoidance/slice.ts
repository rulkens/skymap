/**
 * zoneOfAvoidance — the Zone-of-Avoidance singleton-overlay Layer's settings
 * cluster: the visibility toggle plus the band's look knobs, and the
 * reducers that write them.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { ZoneOfAvoidanceTuning } from '../../../../@types/settings/ZoneOfAvoidanceTuning';

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
