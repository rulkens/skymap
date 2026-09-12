/**
 * zoneOfAvoidance — the Zone-of-Avoidance singleton-overlay Layer's settings
 * cluster: the visibility toggle plus the band's look knobs, and the case
 * reducers that write them. `liftClusterReducers` re-bases those reducers
 * onto the settings root, so their action type strings stay `settings/<key>`.
 */

import type { PayloadAction } from '@reduxjs/toolkit';

import {
  DEFAULT_ZONE_OF_AVOIDANCE_ENABLED,
  DEFAULT_ZONE_OF_AVOIDANCE_TUNING,
} from '../../../data/defaults';
import type { LayerSettingsFragment } from '../../../@types/settings/LayerSettingsFragment';
import type { ZoneOfAvoidanceSettings } from '../../../@types/settings/ZoneOfAvoidanceSettings';
import type { ZoneOfAvoidanceTuning } from '../../../@types/settings/ZoneOfAvoidanceTuning';

// Zone of Avoidance is a singleton overlay layer like `milkyWay`: one
// visibility toggle (band + lettering) plus the band's look knobs, read
// from `DEFAULT_ZONE_OF_AVOIDANCE_TUNING`.
const initialState: ZoneOfAvoidanceSettings = {
  enabled: DEFAULT_ZONE_OF_AVOIDANCE_ENABLED,
  ...DEFAULT_ZONE_OF_AVOIDANCE_TUNING,
};

export const zoneOfAvoidanceSettingsFragment = {
  key: 'zoneOfAvoidance',
  initialState,
  reducers: {
    setZoneOfAvoidanceEnabled: (
      cluster: ZoneOfAvoidanceSettings,
      action: PayloadAction<boolean>,
    ) => {
      cluster.enabled = action.payload;
    },
    // Band look knobs, patched leaf-by-leaf — the same visibility/tuning split
    // `setMilkyWayTuning` makes, so a knob patch can never flip `enabled`.
    setZoneOfAvoidanceTuning: (
      cluster: ZoneOfAvoidanceSettings,
      action: PayloadAction<Partial<ZoneOfAvoidanceTuning>>,
    ) => {
      Object.assign(cluster, action.payload);
    },
  },
} as const satisfies LayerSettingsFragment<'zoneOfAvoidance', ZoneOfAvoidanceSettings>;
