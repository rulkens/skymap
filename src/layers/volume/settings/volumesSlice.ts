/**
 * volumes — the scalar-volume overlay Layer's settings cluster: the master
 * gate plus per-field params, and the reducers that write them.
 */

import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_VOLUMES_ENABLED } from '../../../data/defaults';
import {
  buildVolumeFieldSettings,
  seedVolumeFields,
} from '../../../data/volume/volumeFieldDefaults';
import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from '../../../@types/settings/VolumeFieldSettings';
import type { VolumeSettings } from '../../../@types/settings/VolumeSettings';

const initialState: VolumeSettings = {
  enabled: DEFAULT_VOLUMES_ENABLED,
  items: seedVolumeFields(),
};

export const volumesSlice = createSlice({
  name: 'settings/volumes',
  reducerPath: 'volumes',
  initialState,
  reducers: {
    setVolumesEnabled: (volumes, action: PayloadAction<boolean>) => {
      volumes.enabled = action.payload;
    },
    addVolumeField: (volumes, action: PayloadAction<VolumeFieldId>) => {
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
    removeVolumeField: (volumes, action: PayloadAction<VolumeFieldId>) => {
      delete volumes.items[action.payload];
    },
    writeVolumeField: (
      volumes,
      action: PayloadAction<{ id: VolumeFieldId; patch: Partial<VolumeFieldSettings> }>,
    ) => {
      // Shallow per-field merge via Immer's `Object.assign`. An unknown id
      // is a silent no-op.
      const row = volumes.items[action.payload.id];
      if (!row) return;
      Object.assign(row, action.payload.patch);
    },
  },
});

export const { setVolumesEnabled, addVolumeField, removeVolumeField, writeVolumeField } =
  volumesSlice.actions;
