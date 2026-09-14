/** flow — the CF4++ flow-field singleton-overlay Layer's settings cluster. */

import type { PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_FLOW } from '../../../data/defaults';
import type { FlowFieldDefaults } from '../../../@types/data/flow/FlowFieldDefaults';
import type { FlowSettings } from '../../../@types/settings/FlowSettings';
import type { LayerSettingsFragment } from '../../../@types/settings/LayerSettingsFragment';

// No data-layer store — "loaded" is the asset slot's own `ready` state
// (`slotReady(assetSlots.flow)`).
const initialState: FlowSettings = { ...DEFAULT_FLOW };

export const flowSettingsFragment = {
  key: 'flow',
  initialState,
  reducers: {
    // Its own single writer (like setMilkyWayEnabled / setVolumesEnabled); `setFlow`'s
    // payload excludes `enabled` so the visibility intent never rides the generic merge.
    setFlowEnabled: (cluster: FlowSettings, action: PayloadAction<boolean>) => {
      cluster.enabled = action.payload;
    },
    setFlow: (cluster: FlowSettings, action: PayloadAction<Partial<FlowFieldDefaults>>) => {
      // Leaf-by-leaf merge of the partial knob patch into the flow slice.
      Object.assign(cluster, action.payload);
    },
  },
} as const satisfies LayerSettingsFragment<'flow', FlowSettings>;
