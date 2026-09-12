/**
 * structures — the structure-overlay Layer's settings cluster: one item row
 * per category (ring + label axes) and the case reducers that write them.
 * `liftClusterReducers` re-bases those reducers onto the settings root, so
 * their action type strings stay `settings/<key>`.
 */

import type { PayloadAction } from '@reduxjs/toolkit';

import { STRUCTURE_IDS } from '../../../data/structure/structureIds';
import type { LayerSettingsFragment } from '../../../@types/settings/LayerSettingsFragment';
import type { StructureId } from '../../../@types/data/structure/StructureId';
import type { StructureItemSettings } from '../../../@types/settings/StructureItemSettings';
import type { StructureSettings } from '../../../@types/settings/StructureSettings';

// Structure overlay: one item row per category, each ring + label
// default-on. Keys are DERIVED from `STRUCTURE_IDS` so the rows can't
// drift from the structure-id set (famous galaxies bear no ring and so
// have no row here).
const initialState: StructureSettings = {
  items: Object.fromEntries(
    STRUCTURE_IDS.map((c) => [c, { enabled: true, labelEnabled: true }]),
  ) as Record<StructureId, StructureItemSettings>,
};

export const structuresSettingsFragment = {
  key: 'structures',
  initialState,
  reducers: {
    setStructureItemEnabled: (
      cluster: StructureSettings,
      action: PayloadAction<{ id: StructureId; enabled: boolean }>,
    ) => {
      cluster.items[action.payload.id].enabled = action.payload.enabled;
    },
    setStructureLabelEnabled: (
      cluster: StructureSettings,
      action: PayloadAction<{ id: StructureId; enabled: boolean }>,
    ) => {
      cluster.items[action.payload.id].labelEnabled = action.payload.enabled;
    },
  },
} as const satisfies LayerSettingsFragment<'structures', StructureSettings>;
