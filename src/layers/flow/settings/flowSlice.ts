/** flow — the CF4++ flow-field singleton-overlay Layer's settings cluster. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_FLOW } from './defaults';
import type { FlowFieldDefaults } from '../../../@types/data/flow/FlowFieldDefaults';
import type { FlowSettings } from '../../../@types/settings/FlowSettings';

// No data-layer store — "loaded" is the asset slot's own `ready` state
// (`slotReady(assetSlots.flow)`).
const initialState: FlowSettings = { ...DEFAULT_FLOW };

export const flowSlice = createSlice({
  name: 'settings/flow',
  reducerPath: 'flow',
  initialState,
  reducers: {
    // Its own single writer (like setMilkyWayEnabled / setVolumesEnabled); `setFlow`'s
    // payload excludes `enabled` so the visibility intent never rides the generic merge.
    setFlowEnabled: (flow, action: PayloadAction<boolean>) => {
      flow.enabled = action.payload;
    },
    setFlow: (flow, action: PayloadAction<Partial<FlowFieldDefaults>>) => {
      // Leaf-by-leaf merge of the partial knob patch into the flow slice.
      Object.assign(flow, action.payload);
    },
  },
});

export const { setFlowEnabled, setFlow } = flowSlice.actions;
