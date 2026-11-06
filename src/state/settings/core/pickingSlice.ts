/**
 * picking — cross-cutting: the selection kinds a scene click or hover may not
 * resolve; none by default. An exhibit authors a patch via `SettingsSnapshot`;
 * the bracket restores it on exit. No reducer: nothing else writes this cluster today.
 */

import { createSlice } from '@reduxjs/toolkit';

import type { PickingSettings } from '../../../@types/settings/PickingSettings';

export const pickingInitialState: PickingSettings = { off: [] };

export const pickingSlice = createSlice({
  name: 'settings/picking',
  reducerPath: 'picking',
  initialState: pickingInitialState,
  reducers: {},
});
