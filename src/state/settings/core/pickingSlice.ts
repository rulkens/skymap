/**
 * picking — cross-cutting: which selection kinds a scene click or hover may
 * resolve. An exhibit authors a patch via `SettingsSnapshot`; the bracket
 * restores it on exit. No reducer: nothing else writes this cluster today.
 */

import { createSlice } from '@reduxjs/toolkit';

import type { PickingSettings } from '../../../@types/settings/PickingSettings';

export const pickingInitialState: PickingSettings = {
  kinds: {
    galaxyCatalog: true,
    structure: true,
    milkyWay: true,
    zoneOfAvoidance: true,
    body: true,
    starCatalog: true,
  },
};

export const pickingSlice = createSlice({
  name: 'settings/picking',
  reducerPath: 'picking',
  initialState: pickingInitialState,
  reducers: {},
});
