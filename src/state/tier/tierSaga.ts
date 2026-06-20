/**
 * tierSaga — the watcher that turns a tier COMMAND into the tier WRITE, with the
 * engine's data-transition runner fired in between, and a galaxy-selection re-anchor
 * after the new clouds land.
 *
 * The command/write split is the whole point. 'requestTier' is the command: a
 * reducer-less action a UI control or a tour step dispatches to express intent
 * ('I want the large tier'). 'setTier' is the write the saga issues once it has
 * decided the change is real. Keeping them separate means the store's tier only
 * flips on the saga's own terms, never optimistically and never as a side effect
 * of an unrelated settings merge.
 *
 * 'prev' is read BEFORE the write so the per-source tier-target diff the engine
 * runner computes stays honest — the runner needs the tier the data was loaded
 * AT to know which sources actually changed budget. Reading after the 'setTier'
 * write would hand it the new tier on both sides and the diff would always be
 * empty.
 *
 * The 'prev === payload' early-return is the same-tier no-op. Re-selecting the
 * tier that is already current is a real UI event (a dropdown re-pick); without
 * the guard it would re-issue the write and fire the runner, which today
 * unconditionally rebuilds the famous-galaxy texture atlas for nothing. The
 * guard makes the steady state idle.
 *
 * 'run?.' is defensive against the window before the engine has registered its
 * runner via 'setSagaContext'. In practice that window is closed — boot finishes
 * wiring the context long before the tier dropdown is interactive — but a guarded
 * no-op is cheaper than a throw on a path that must never crash the store.
 *
 * The transition is synchronous today: the runner's loads and famous rebuild are
 * fire-and-forget, so the saga issues the write and calls 'run' in one tick.
 * Only the 'run(...)' line would become 'yield* call(run, ...)' if a step ever
 * needed to be cancellable under 'takeLatest' (e.g. a long load the next request
 * should abort).
 *
 * ### Galaxy selection re-anchor
 *
 * A galaxy SelectionRef is POSITIONAL (source + index). When a tier swap evicts
 * and reloads a source's cloud, the same index points at a different galaxy (or
 * none). To preserve the user's intent:
 *
 *   1. BEFORE the write, capture the durable focus id of each galaxy select/focus
 *      ref whose source actually reloads on this swap (old cloud still present;
 *      focusIdOf can read the objID).
 *   2. Hover is cleared unconditionally — a stale hover over an evicted cloud is
 *      meaningless, and re-anchoring it would fight the clear.
 *   3. AFTER catalogLoaded for each captured source, re-resolve the id to the
 *      new index and write it back (hit → re-anchor, miss → clear the slot).
 *
 * Only sources whose tierTarget changes across prev→next are captured; tier-
 * agnostic sources never reload so they emit no catalogLoaded and their refs
 * never drift. 'takeLatest' aborts the re-anchor loop if a newer 'requestTier'
 * arrives mid-reanchor, preventing a stale re-anchor from clobbering a fresh
 * intent.
 */

import { takeLatest, select, put, take, getContext } from 'typed-redux-saga';
import type { Action } from '@reduxjs/toolkit';

import { requestTier } from './requestTier';
import { setTier } from './tierSlice';
import { selectTier } from './selectors';
import { captureGalaxyFocusIds } from '../selection/captureGalaxyFocusIds';
import { SELECTION_WRITE_BY_SLOT } from '../selection/selectionWriteBySlot';
import { updateSelectionHover } from '../selection/selectionSlice';
import { resolveFocusId } from '../../services/url/resolveFocusId';
import { catalogLoaded } from '../catalog/catalogLoaded';
import type { RootState, RunTierTransition, SagaContext } from '../../store/types';

export function* watchTier() {
  yield* takeLatest(requestTier, function* (action) {
    const prev = yield* select(selectTier);
    if (prev === action.payload) return;

    const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');

    // Capture durable galaxy focus ids BEFORE the write — the old clouds are
    // still present, so focusIdOf can read the objID. Only sources whose
    // tier target changes are captured (tier-agnostic sources never reload).
    // Structure / milkyWay refs are durable and survive untouched.
    const state = yield* select((s: RootState) => s);
    const reanchor = resolveDeps
      ? captureGalaxyFocusIds(state, resolveDeps(), prev, action.payload)
      : [];

    // Clear hover across the swap: a stale hover ref over an evicted cloud
    // would resolve to a different galaxy. (Select / focus are re-anchored below.)
    yield* put(updateSelectionHover(null));

    const run = yield* getContext<RunTierTransition>('runTierTransition');
    yield* put(setTier(action.payload));
    run?.(prev, action.payload); // eviction + reload starts (fire-and-forget)

    // Re-anchor each captured galaxy slot once its source's new cloud lands.
    // Bounded: only reloading sources were captured, so catalogLoaded for that
    // source is guaranteed to arrive (or takeLatest aborts this worker if a
    // newer requestTier arrives, preventing a stale re-anchor).
    for (const { slot, source, focusId } of reanchor) {
      yield* take((a: Action) => catalogLoaded.match(a) && a.payload.source === source);
      // resolveDeps is guaranteed non-null here: reanchor is only non-empty when
      // resolveDeps was available (the `resolveDeps ? ... : []` guard above).
      const ref = resolveFocusId(focusId, resolveDeps!());
      yield* put(SELECTION_WRITE_BY_SLOT[slot](ref)); // hit → re-anchor; miss → null (clears slot)
    }
  });
}
