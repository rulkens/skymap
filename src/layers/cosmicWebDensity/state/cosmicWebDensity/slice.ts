/**
 * cosmicWebDensity — the scalar-volume overlay Layer's settings cluster: the
 * master gate plus per-field params, and the reducers that write them.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

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
    writeCosmicWebDensityField: (
      volumes,
      action: PayloadAction<{ id: CosmicWebDensityFieldId; patch: Partial<VolumeFieldSettings> }>,
    ) => {
      Object.assign(volumes.items[action.payload.id], action.payload.patch);
    },
  },
});

export const { setCosmicWebDensityEnabled, writeCosmicWebDensityField } =
  cosmicWebDensitySlice.actions;
