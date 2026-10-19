/** voyage — the voyage Layer's Intent cluster; the takeover bracket restores it, and the rest frame with it. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { VoyageDestinationId } from '../../@types/VoyageDestinationId';
import { MISSION_SPEEDS } from '../../../../data/exhibits/mission/missionSpeeds';
import { initialState } from './initialState';

export const voyageSlice = createSlice({
  name: 'settings/voyage',
  reducerPath: 'voyage',
  initialState,
  reducers: {
    setVoyageDestination: (voyage, action: PayloadAction<VoyageDestinationId | null>) => {
      voyage.destination = action.payload;
    },
    setVoyageLaunchDays: (voyage, action: PayloadAction<number | null>) => {
      voyage.launchDays = action.payload;
    },
    setVoyageContraction: (voyage, action: PayloadAction<boolean>) => {
      voyage.contraction = action.payload;
    },
    setVoyageDoppler: (voyage, action: PayloadAction<boolean>) => {
      voyage.doppler = action.payload;
    },
    setVoyageHeadlight: (voyage, action: PayloadAction<number>) => {
      voyage.headlight = action.payload;
    },
    // One `MISSION_SPEEDS` factor per step, clamped at the ends, as the missions transport.
    stepVoyageSpeed: (voyage, action: PayloadAction<{ step: -1 | 1 }>) => {
      const at = Math.max(0, MISSION_SPEEDS.indexOf(voyage.speed));
      const index = Math.min(MISSION_SPEEDS.length - 1, Math.max(0, at + action.payload.step));
      voyage.speed = MISSION_SPEEDS[index]!;
    },
  },
});

export const {
  setVoyageDestination,
  setVoyageLaunchDays,
  setVoyageContraction,
  setVoyageDoppler,
  setVoyageHeadlight,
  stepVoyageSpeed,
} = voyageSlice.actions;
