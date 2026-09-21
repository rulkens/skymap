/**
 * structures — the structure-overlay Layer's settings cluster: one item row
 * per category (ring + label axes) and the reducers that write them.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { STRUCTURE_IDS } from '../../../../data/structure/structureIds';
import type { StructureId } from '../../../../@types/data/structure/StructureId';
import type { StructureItemSettings } from '../../../../@types/settings/StructureItemSettings';
import type { StructureSettings } from '../../../../@types/settings/StructureSettings';

// Structure overlay: one item row per category, each ring + label
// default-on. Keys are DERIVED from `STRUCTURE_IDS` so the rows can't
// drift from the structure-id set (famous galaxies bear no ring and so
// have no row here).
const initialState: StructureSettings = {
  items: Object.fromEntries(
    STRUCTURE_IDS.map((c) => [c, { enabled: true, labelEnabled: true }]),
  ) as Record<StructureId, StructureItemSettings>,
};

export const structuresSlice = createSlice({
  name: 'settings/structures',
  reducerPath: 'structures',
  initialState,
  reducers: {
    setStructureItemEnabled: (
      structures,
      action: PayloadAction<{ id: StructureId; enabled: boolean }>,
    ) => {
      structures.items[action.payload.id].enabled = action.payload.enabled;
    },
    setStructureLabelEnabled: (
      structures,
      action: PayloadAction<{ id: StructureId; enabled: boolean }>,
    ) => {
      structures.items[action.payload.id].labelEnabled = action.payload.enabled;
    },
  },
});

export const { setStructureItemEnabled, setStructureLabelEnabled } = structuresSlice.actions;
