/**
 * goHome — the reducer-less COMMAND that asks the home saga to fly the camera
 * to the canonical sunlit Earth pose and pin Earth in the select + focus slots.
 * Mirrors requestFocus: dispatching it changes no state; watchGoHomeSaga does
 * the work. Every home entry point (the `h`/`e` keys, the Home pill) dispatches
 * this one action, so the saga is the single place that knows what home means.
 */
import { createAction } from '@reduxjs/toolkit';

export const goHome = createAction('selection/goHome');
