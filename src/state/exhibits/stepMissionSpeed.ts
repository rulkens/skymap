import { createAction } from '@reduxjs/toolkit';

/** The exhibit transport's − / +: one `MISSION_SPEEDS` factor down or up, then play from here. */
export const stepMissionSpeed = createAction<{ step: -1 | 1 }>('exhibits/stepMissionSpeed');
