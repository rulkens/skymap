/**
 * skyClockTo — the reducer-less COMMAND "sweep the sim clock forward to this instant and rest
 * there paused". `watchSkyClockToSaga` plays it as a scripted clock profile.
 */
import { createAction } from '@reduxjs/toolkit';

export const skyClockTo = createAction<{ simDays: number }>('sky/clockTo');
