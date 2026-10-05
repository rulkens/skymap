/** bodies — the body Layer's near-field body-gate cluster: one item row per body id. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { BodyId } from '../../../../@types/data/body/BodyId';

export const bodiesSlice = createSlice({
  name: 'settings/bodies',
  reducerPath: 'bodies',
  initialState,
  reducers: {
    // The caption axis is the only WRITABLE one: `bodies.items[id].enabled` is
    // seeded from the registry row but has no reader left now the stars gate
    // themselves, and no product decision has been made to expose a "hide this
    // body" control. There is no cluster-level gate either, for the same reason
    // (see EngineSettingsState).
    setBodyLabelEnabled: (bodies, action: PayloadAction<{ id: BodyId; enabled: boolean }>) => {
      bodies.items[action.payload.id].labelEnabled = action.payload.enabled;
    },
  },
});

export const { setBodyLabelEnabled } = bodiesSlice.actions;
