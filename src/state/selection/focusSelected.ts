/**
 * focusSelected — the reducer-less COMMAND "focus what is selected": the `f` key's intent
 * (and the double-click's off the ground, via `viewSelected`). watchFocusSelectedSaga does the work.
 */
import { createAction } from '@reduxjs/toolkit';

export const focusSelected = createAction('selection/focusSelected');
