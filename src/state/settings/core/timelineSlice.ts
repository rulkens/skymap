/**
 * timeline — a timeline exhibit's selected lane and its clock's speed. In
 * `CORE_SNAPSHOT_CLUSTERS`, so the takeover bracket restores both on exit.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { TIMELINE_SPEEDS } from '../../../data/exhibits/timeline/timelineSpeeds';
import type { TimelineSettings } from '../../../@types/settings/TimelineSettings';

export const timelineInitialState: TimelineSettings = { lane: null, speed: 1 };

export const timelineSlice = createSlice({
  name: 'settings/timeline',
  reducerPath: 'timeline',
  initialState: timelineInitialState,
  reducers: {
    // The exhibit timeline's lane tabs.
    setTimelineLane: (timeline, action: PayloadAction<string | null>) => {
      timeline.lane = action.payload;
    },
    // The exhibit transport's − / + and `[` / `]`: one `TIMELINE_SPEEDS` factor, clamped at the ends.
    stepTimelineSpeed: (timeline, action: PayloadAction<{ step: -1 | 1 }>) => {
      const at = Math.max(0, TIMELINE_SPEEDS.indexOf(timeline.speed));
      const index = Math.min(TIMELINE_SPEEDS.length - 1, Math.max(0, at + action.payload.step));
      timeline.speed = TIMELINE_SPEEDS[index]!;
    },
  },
});

export const { setTimelineLane, stepTimelineSpeed } = timelineSlice.actions;
