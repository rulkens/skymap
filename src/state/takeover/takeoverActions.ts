/**
 * takeoverActions — `runTakeoverSaga` dispatches started/ended itself; `exitTakeover`
 * is the reducer-less signal a tour's Esc/nav and an exhibit's overlay raise to
 * ask the running body to end. Not slice reducers: the slice stays free for state a
 * component dispatches directly (mirroring `requestFocus` beside `selectionSlice`).
 */
import { createAction } from '@reduxjs/toolkit';

import type { TakeoverSource } from '../../@types/takeover/TakeoverSource';

export const takeoverStarted = createAction<TakeoverSource>('takeover/started');
export const takeoverEnded = createAction('takeover/ended');
export const exitTakeover = createAction('takeover/exit');
