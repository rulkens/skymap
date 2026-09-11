/**
 * flow — the CF4++ flow-field singleton-overlay Layer's settings cluster: the
 * master gate plus look/motion knobs, and the case reducers that write them.
 * `liftClusterReducers` re-bases those reducers onto the settings root, so
 * their action type strings stay `settings/<key>`.
 */

import type { PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_FLOW } from '../../../data/defaults';
import type { FlowFieldDefaults } from '../../../@types/data/flow/FlowFieldDefaults';
import type { FlowSettings } from '../../../@types/settings/FlowSettings';
import type { LayerSettingsFragment } from '../../../@types/settings/LayerSettingsFragment';

export const flowSettingsFragment = {
  key: 'flow',
  // Flow is a singleton overlay layer: all its user-facing state (master
  // gate + look/motion knobs) lives here, spread from the single
  // `DEFAULT_FLOW` seed. Flow has no data-layer store — "loaded" is the asset
  // slot's own `ready` state (`slotReady(assetSlots.flow)`).
  seed: (): FlowSettings => ({ ...DEFAULT_FLOW }),
  reducers: {
    // The master gate is its own scalar setter (like setMilkyWayEnabled /
    // setVolumesEnabled), so `flow.enabled` has a single writer. `setFlow`
    // patches only the look/motion knobs — its payload deliberately excludes
    // `enabled`, keeping the visibility intent off the generic merge path.
    setFlowEnabled: (cluster: FlowSettings, action: PayloadAction<boolean>) => {
      cluster.enabled = action.payload;
    },
    setFlow: (cluster: FlowSettings, action: PayloadAction<Partial<FlowFieldDefaults>>) => {
      // Leaf-by-leaf merge of the partial knob patch into the flow slice.
      Object.assign(cluster, action.payload);
    },
  },
} as const satisfies LayerSettingsFragment<'flow', FlowSettings>;
