/**
 * cosmicWebDensity — the scalar-volume overlay Layer's settings cluster: the
 * master gate plus per-field params, and the reducers that write them.
 */

import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { CosmicWebDensityFieldId } from '../../../../@types/data/volume/CosmicWebDensityFieldId';
import type { VolumeFieldSettings } from '../../../../@types/settings/VolumeFieldSettings';

export const cosmicWebDensitySlice = createSlice({
  name: 'settings/cosmicWebDensity',
  reducerPath: 'cosmicWebDensity',
  initialState,
  reducers: {
    setCosmicWebDensityEnabled: (volumes, action: PayloadAction<boolean>) => {
      volumes.enabled = action.payload;
    },
    addCosmicWebDensityField: (volumes, action: PayloadAction<CosmicWebDensityFieldId>) => {
      // `items` is a total record now — every id is already present at
      // boot, so this early return always fires. Kept only until Task 4
      // deletes the reducer entirely.
      if (volumes.items[action.payload]) return;
      volumes.items[action.payload] = initialState.items[
        action.payload
      ] as Draft<VolumeFieldSettings>;
    },
    writeCosmicWebDensityField: (
      volumes,
      action: PayloadAction<{ id: CosmicWebDensityFieldId; patch: Partial<VolumeFieldSettings> }>,
    ) => {
      // Shallow per-field merge via Immer's `Object.assign`. An unknown id
      // is a silent no-op.
      const row = volumes.items[action.payload.id];
      if (!row) return;
      Object.assign(row, action.payload.patch);
    },
  },
});

export const { setCosmicWebDensityEnabled, addCosmicWebDensityField, writeCosmicWebDensityField } =
  cosmicWebDensitySlice.actions;
