/**
 * commands.ts — one-shot user commands with no state of their own: reset,
 * clear-trace, and the two export legs. Replaces the sim slice's former
 * token-counter fields (`resetToken`/`clearTraceToken`/`exportToken`/
 * `scfdToken`); Tasks 7/8's sagas `takeEvery`/`takeLeading` these directly
 * instead of a component diffing a counter against its last-seen value.
 */
import { createAction } from '@reduxjs/toolkit';

export const resetRequested = createAction('sim/resetRequested');
export const clearTraceRequested = createAction('sim/clearTraceRequested');
export const exportNpyRequested = createAction('export/exportNpyRequested');
export const exportScfdRequested = createAction('export/exportScfdRequested');
