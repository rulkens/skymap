/**
 * takeoverActions — the three signals `runTakeover`'s bracket threads through
 * Redux. `takeoverStarted`/`takeoverEnded` are dispatched by `runTakeover`
 * itself, defined here rather than as `takeoverSlice` reducers (mirroring
 * `requestFocus`/`requestSelect` beside `selectionSlice`) so the slice stays
 * free for state a component might dispatch directly. `exitTakeover` is the
 * reducer-less signal a tour's Esc/nav and a view's overlay both raise to ask
 * the running body to end.
 */
import { createAction } from '@reduxjs/toolkit';

import type { TakeoverSource } from '../../@types/takeover/TakeoverSource';

export const takeoverStarted = createAction<TakeoverSource>('takeover/started');
export const takeoverEnded = createAction('takeover/ended');
export const exitTakeover = createAction('takeover/exit');
