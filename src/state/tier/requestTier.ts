/**
 * requestTier — the COMMAND that asks for a tier change, distinct from the write
 * that performs it.
 *
 * This is a reducer-less `createAction`: dispatching `requestTier('large')`
 * changes NOTHING in the store. No reducer listens to it; it carries no state
 * transition of its own. It exists purely as the trigger the tier saga (added in
 * a later task) picks up via `takeLatest`. The saga is what reacts — it drives
 * the engine's data load and then dispatches the actual `setTier` write (the
 * reducer in `tierSlice`) once the new tier's bins are ready.
 *
 * Splitting the request (command) from the `setTier` write (state change) is the
 * point of this whole effort: a UI control or a tour step expresses *intent*
 * ("I want the large tier") through `requestTier`, and the store's `tier` value
 * only flips after the saga has done the asynchronous loading work — never
 * optimistically, and never as a side effect of an unrelated settings merge.
 */

import { createAction } from '@reduxjs/toolkit';

import type { Tier } from '../../@types/data/Tier';

export const requestTier = createAction<Tier>('tier/requestTier');
