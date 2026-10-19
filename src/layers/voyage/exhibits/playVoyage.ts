import { createAction } from '@reduxjs/toolkit';

/** The voyage transport's run button: play the trip in ship time from the current instant. */
export const playVoyage = createAction('voyage/play');
