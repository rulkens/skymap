import { createAction } from '@reduxjs/toolkit';

/** The exhibit transport's run button: play the timeline profile from the current instant. */
export const playTimeline = createAction('exhibits/playTimeline');
