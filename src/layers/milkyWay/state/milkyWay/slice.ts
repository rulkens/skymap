/** milkyWay — the Milky-Way singleton-overlay Layer's settings cluster. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { MilkyWayCloudTuning } from '../../../../@types/settings/MilkyWayCloudTuning';
import type { MilkyWayFieldTuning } from '../../@types/MilkyWayFieldTuning';
import type { MilkyWayRenderer } from '../../@types/MilkyWayRenderer';

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
    setMilkyWayRenderer: (milkyWay, action: PayloadAction<MilkyWayRenderer>) => {
      milkyWay.renderer = action.payload;
    },
    // Each knob group has its own writer, so a slider patch can never reach the
    // other group or flip a visibility axis — the same split `setFlow` makes.
    setMilkyWayCloudTuning: (milkyWay, action: PayloadAction<Partial<MilkyWayCloudTuning>>) => {
      Object.assign(milkyWay.cloud, action.payload);
    },
    // A shallow merge: a `divisors` patch replaces the whole record.
    setMilkyWayFieldTuning: (milkyWay, action: PayloadAction<Partial<MilkyWayFieldTuning>>) => {
      Object.assign(milkyWay.field, action.payload);
    },
  },
});

export const {
  setMilkyWayEnabled,
  setMilkyWayLabelEnabled,
  setMilkyWayRenderer,
  setMilkyWayCloudTuning,
  setMilkyWayFieldTuning,
} = milkyWaySlice.actions;
