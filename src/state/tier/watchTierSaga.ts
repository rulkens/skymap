/**
 * watchTierSaga — the watcher that turns a tier COMMAND into the tier WRITE,
 * with the engine's data-transition runner fired in between, and a
 * galaxy-selection re-anchor after the new clouds land.
 *
 * `requestTier` is the command a UI control or tour step dispatches to
 * express intent; `setTier` is the write this saga issues once it decides
 * the change is real — keeping them separate means the store's tier only
 * flips on the saga's own terms, never optimistically. `prev` is read
 * BEFORE the write so the engine runner's per-source tier-target diff stays
 * honest (it needs the tier the data was loaded AT); the `prev === payload`
 * guard makes re-selecting the current tier a no-op instead of re-running
 * the runner's unconditional famous-atlas rebuild for nothing.
 *
 * `settings.milkyWay.starCount` is an absolute count with nothing tying it
 * to the tier automatically, so it's re-seeded here from
 * `MILKY_WAY_STARS_PER_TIER[tier]` on every confirmed tier change — otherwise
 * a device dropping to the small tier would keep whatever count a previous
 * DebugPanel session left dialled in. The cloud's own `reconcile` is what
 * actually regenerates the cloud; this saga only owns the seed.
 *
 * A galaxy `SelectionRef` is POSITIONAL (source + index), so when a tier swap
 * evicts and reloads a source's cloud the same index points at a different
 * galaxy (or none). To preserve intent: capture each affected ref's durable
 * focus id BEFORE the write (old cloud still present), clear hover
 * unconditionally (a stale hover is meaningless), then after each source's
 * `catalogLoaded` re-resolve the id to its new index and write it back (hit
 * → re-anchor, miss → clear). Only sources whose tier target actually
 * changes are captured; `takeLatest` aborts the re-anchor loop if a newer
 * `requestTier` arrives mid-reanchor.
 */

import { takeLatest, select, put, take, getContext } from 'typed-redux-saga';
import type { Action } from '@reduxjs/toolkit';

import { requestTier } from './requestTier';
import { setTier } from './tierSlice';
import { selectTier } from './selectors';
import { captureGalaxyFocusIds } from '../selection/captureGalaxyFocusIds';
import { SELECTION_WRITE_BY_SLOT } from '../selection/selectionWriteBySlot';
import { updateSelectionHover } from '../selection/selectionSlice';
import { setMilkyWayTuning } from '../settings/settingsSlice';
import { resolveFocusId } from '../../services/url/resolveFocusId';
import { catalogLoaded } from '../catalog/catalogLoaded';
import { MILKY_WAY_STARS_PER_TIER } from '../../services/engine/galaxyGenerator/v1/milkyWayCalibration';
import type { RootState, RunTierTransition, SagaContext } from '../../store/types';

export function* watchTierSaga() {
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
    // Re-seed the Milky-Way star count from the new tier's budget — see the
    // module header for why an absolute count needs this. The cloud's own
    // `reconcile` picks up the write on its own next-frame call, so nothing
    // here talks to the GPU cloud directly.
    yield* put(setMilkyWayTuning({ starCount: MILKY_WAY_STARS_PER_TIER[action.payload] }));
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
