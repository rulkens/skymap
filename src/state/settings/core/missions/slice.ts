/** missions — the sampled-craft cluster: the trail overlay (independent of orbitTrails), the selected craft and the mission clock's speed. */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { MISSION_SPEEDS } from '../../../../data/exhibits/mission/missionSpeeds';
import { initialState } from './initialState';

export const missionsSlice = createSlice({
  name: 'settings/missions',
  reducerPath: 'missions',
  initialState,
  reducers: {
    setMissionTrailsEnabled: (missions, action: PayloadAction<boolean>) => {
      missions.trails = action.payload;
    },
    // The exhibit timeline's craft switch; the takeover bracket restores it on exit.
    setMissionCraft: (missions, action: PayloadAction<string | null>) => {
      missions.craft = action.payload;
    },
    // The exhibit transport's − / + and `[` / `]`: one `MISSION_SPEEDS` factor, clamped at the ends.
    stepMissionSpeed: (missions, action: PayloadAction<{ step: -1 | 1 }>) => {
      const at = Math.max(0, MISSION_SPEEDS.indexOf(missions.speed));
      const index = Math.min(MISSION_SPEEDS.length - 1, Math.max(0, at + action.payload.step));
      missions.speed = MISSION_SPEEDS[index]!;
    },
  },
});

export const { setMissionTrailsEnabled, setMissionCraft, stepMissionSpeed } = missionsSlice.actions;
