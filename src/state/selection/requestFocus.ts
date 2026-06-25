/**
 * requestFocus — the reducer-less COMMAND that asks the deep-link saga to
 * resolve a durable focus id into a ref. Mirrors requestTier: dispatching it
 * changes no state; the watchRequestFocusSaga (Part 2) resolves the id,
 * deferring on catalogLoaded until the cloud is ready, then dispatches
 * updateSelectionFocus(ref). A palette pick or a hash deep-link dispatches it.
 */
import { createAction } from '@reduxjs/toolkit';

export const requestFocus = createAction<string>('selection/requestFocus');
