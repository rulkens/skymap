/**
 * volumes — the scalar-volume overlay Layer's settings cluster: the master
 * gate plus per-field params, and the case reducers that write them.
 * `liftClusterReducers` re-bases those reducers onto the settings root, so
 * their action type strings stay `settings/<key>`.
 */

import type { Draft, PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_VOLUMES_ENABLED } from '../../../data/defaults';
import {
  buildVolumeFieldSettings,
  seedVolumeFields,
} from '../../../data/volume/volumeFieldDefaults';
import type { LayerSettingsFragment } from '../../../@types/settings/LayerSettingsFragment';
import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from '../../../@types/settings/VolumeFieldSettings';
import type { VolumeSettings } from '../../../@types/settings/VolumeSettings';

const initialState: VolumeSettings = {
  enabled: DEFAULT_VOLUMES_ENABLED,
  items: seedVolumeFields(),
};

export const volumesSettingsFragment = {
  key: 'volumes',
  initialState,
  reducers: {
    setVolumesEnabled: (cluster: VolumeSettings, action: PayloadAction<boolean>) => {
      cluster.enabled = action.payload;
    },
    addVolumeField: (cluster: VolumeSettings, action: PayloadAction<VolumeFieldId>) => {
      // Re-registering a seeded field is a no-op: the early return keeps an
      // existing row (and its tuned sliders) untouched. Only a genuinely-new id
      // seeds a fresh row from registry defaults.
      if (cluster.items[action.payload]) return;
      // Freshly built, stored as-is — sound to re-type as Immer's Draft (no
      // clone needed), same posture as selectionRowsSlice's `setSelectionRow`.
      // `bands`' readonly array is what trips the plain assignment.
      cluster.items[action.payload] = buildVolumeFieldSettings(
        action.payload,
      ) as Draft<VolumeFieldSettings>;
    },
    removeVolumeField: (cluster: VolumeSettings, action: PayloadAction<VolumeFieldId>) => {
      delete cluster.items[action.payload];
    },
    writeVolumeField: (
      cluster: VolumeSettings,
      action: PayloadAction<{ id: VolumeFieldId; patch: Partial<VolumeFieldSettings> }>,
    ) => {
      // Shallow per-field merge via Immer's `Object.assign`. An unknown id
      // is a silent no-op.
      const row = cluster.items[action.payload.id];
      if (!row) return;
      Object.assign(row, action.payload.patch);
    },
  },
} as const satisfies LayerSettingsFragment<'volumes', VolumeSettings>;
