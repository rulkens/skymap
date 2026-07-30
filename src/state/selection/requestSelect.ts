/**
 * requestSelect — the reducer-less COMMAND that resolves a durable focus id and
 * PINS it in the InfoCard (the `select` slot). It is the sibling of requestFocus,
 * which sets the focus/camera slot instead; dispatching either changes no state
 * directly — the watchRequestSelectSaga resolves the id (deferring until its
 * catalog lands), then dispatches updateSelectionSelect(ref). Each command stays
 * single-purpose (one command, one slot); a caller wanting both a pinned card and
 * a camera fly dispatches both.
 */
import { createAction } from '@reduxjs/toolkit';

export const requestSelect = createAction<string>('selection/requestSelect');
