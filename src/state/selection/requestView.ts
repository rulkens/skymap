/**
 * requestView — the reducer-less COMMAND a palette pick dispatches: "show me
 * this id". Unlike `requestFocus` it names no camera move, so
 * `watchRequestViewSaga` decides how the view is shown. The InfoCard's Focus
 * button and `F` keep dispatching `requestFocus`.
 */
import { createAction } from '@reduxjs/toolkit';

export const requestView = createAction<{ id: string }>('selection/requestView');
