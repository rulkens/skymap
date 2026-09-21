/** milkyWay — the Milky-Way singleton-overlay Layer's settings cluster. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { MilkyWayTuning } from '../../../../@types/settings/MilkyWayTuning';

export const milkyWaySlice = createSlice({
  name: 'settings/milkyWay',
  reducerPath: 'milkyWay',
  initialState,
  reducers: {
    setMilkyWayEnabled: (milkyWay, action: PayloadAction<boolean>) => {
      milkyWay.enabled = action.payload;
    },
    setMilkyWayLabelEnabled: (milkyWay, action: PayloadAction<boolean>) => {
      milkyWay.labelEnabled = action.payload;
    },
    // Star-cloud look knobs, patched leaf-by-leaf from the DebugPanel sliders.
    // The payload is `MilkyWayTuning`, not `MilkyWaySettings`, so the two
    // visibility axes keep their own single writers above and can never be
    // flipped by a knob patch — the same split `setFlow` makes.
    setMilkyWayTuning: (milkyWay, action: PayloadAction<Partial<MilkyWayTuning>>) => {
      Object.assign(milkyWay, action.payload);
    },
  },
});

export const { setMilkyWayEnabled, setMilkyWayLabelEnabled, setMilkyWayTuning } =
  milkyWaySlice.actions;
