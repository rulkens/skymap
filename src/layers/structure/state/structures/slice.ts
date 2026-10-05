/**
 * structures — the structure-overlay Layer's settings cluster: one item row
 * per category (ring + label axes) and the reducers that write them.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { StructureId } from '../../../../@types/data/structure/StructureId';

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
