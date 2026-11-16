/**
 * viewSelected — the reducer-less COMMAND "show what is selected": the canvas double-click.
 * watchFocusSelectedSaga asks for the view while standing, as a search pick does, and
 * focuses (a fly) anywhere else.
 */
import { createAction } from '@reduxjs/toolkit';

export const viewSelected = createAction('selection/viewSelected');
