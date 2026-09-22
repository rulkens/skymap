/**
 * cosmicWebDensity — the scalar-volume overlay Layer's settings cluster: the
 * master gate plus per-field params, and the reducers that write them.
 */

import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import { buildVolumeFieldSettings } from '../../../../data/volume/volumeFieldDefaults';
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
      // Re-registering a seeded field is a no-op: the early return keeps an
      // existing row (and its tuned sliders) untouched. Only a genuinely-new id
      // seeds a fresh row from registry defaults.
      if (volumes.items[action.payload]) return;
      // Freshly built, stored as-is — sound to re-type as Immer's Draft (no
      // clone needed), same posture as selectionRowsSlice's `setSelectionRow`.
      // `bands`' readonly array is what trips the plain assignment.
      volumes.items[action.payload] = buildVolumeFieldSettings(
        action.payload,
      ) as Draft<VolumeFieldSettings>;
    },
    removeCosmicWebDensityField: (volumes, action: PayloadAction<CosmicWebDensityFieldId>) => {
      delete volumes.items[action.payload];
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

export const { setCosmicWebDensityEnabled, addCosmicWebDensityField, removeCosmicWebDensityField, writeCosmicWebDensityField } =
  cosmicWebDensitySlice.actions;
