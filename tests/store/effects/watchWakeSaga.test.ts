/**
 * watchWakeSaga tests — verifies that a write to a WAKE_ROUTE (settings,
 * camera, the sim clock, or the tier) pokes the passive render-on-demand
 * scheduler via requestRender.
 *
 * Runs under the shared reconcileSagaHarness (all four reconcile watchers), so
 * settings writes that also drive other effects still behave faithfully.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { buildStore, type ReconcileSpies } from './reconcileSagaHarness';
import { setGalaxyCatalogSize } from '../../../src/state/settings/settingsSlice';
import { beginDrag, setAutoRotate } from '../../../src/state/camera/cameraSlice';
import { setTier } from '../../../src/state/tier/tierSlice';
import { pause, resume } from '../../../src/state/time/timeSlice';

describe('watchWakeSaga', () => {
  let store: ReturnType<typeof buildStore>['store'];
  let reconcile: ReconcileSpies;

  beforeEach(() => {
    const built = buildStore();
    store = built.store;
    reconcile = built.reconcile;
  });

  // ── settings write wakes the loop ──────────────────────────────────────────

  it('setGalaxyCatalogSize(n) → requestRender called', () => {
    store.dispatch(setGalaxyCatalogSize(4));

    expect(reconcile.requestRender).toHaveBeenCalledTimes(1);
  });

  // ── camera writes wake the loop ─────────────────────────────────────────────

  it('a camera slice write (beginDrag) wakes the loop', () => {
    store.dispatch(beginDrag());

    expect(reconcile.requestRender).toHaveBeenCalledTimes(1);
  });

  it('a camera slice write (setAutoRotate) wakes the loop', () => {
    store.dispatch(setAutoRotate({ active: true, rate: 0.001 }));

    expect(reconcile.requestRender).toHaveBeenCalledTimes(1);
  });

  // ── tier writes wake the loop ───────────────────────────────────────────────
  // The catalog reload after a tier change starts from a FRAME (the demand
  // loop's drift edge), so a `tier/` write that arrives while the loop is
  // asleep must schedule one in its own right — nothing else will.

  it('a tier write wakes the render loop', () => {
    store.dispatch(setTier('large'));

    expect(reconcile.requestRender).toHaveBeenCalledTimes(1);
  });

  // ── time slice writes wake the loop ─────────────────────────────────────────
  // A clock intent (play/pause/rate/scrub) seen while the scene is at rest must
  // poke the passive scheduler so the first playing frame — and each paused
  // single-step redraw — appears at once instead of waiting for a coincidental
  // live-idle tick. Fails if `timeRoute` is dropped from WAKE_ROUTES.

  it('a time slice write (pause) wakes the loop', () => {
    store.dispatch(pause({ nowMs: 0 }));

    expect(reconcile.requestRender).toHaveBeenCalledTimes(1);
  });

  it('a time slice write (resume) wakes the loop', () => {
    store.dispatch(resume({ nowMs: 0 }));

    expect(reconcile.requestRender).toHaveBeenCalledTimes(1);
  });
});
