/**
 * focusSelected — the reducer-less COMMAND "focus what is selected": the one
 * intent behind the `f` key and the canvas double-click. watchFocusSelectedSaga does the work.
 */
import { createAction } from '@reduxjs/toolkit';

export const focusSelected = createAction('selection/focusSelected');
