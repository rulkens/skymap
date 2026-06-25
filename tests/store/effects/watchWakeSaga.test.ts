/**
 * watchWakeSaga tests — verifies that a write to a WAKE_ROUTE (settings or
 * camera) pokes the passive render-on-demand scheduler via requestRender, and
 * that a write to a non-wake route (tier) does not.
 *
 * Runs under the shared reconcileSagaHarness (all four reconcile watchers), so
 * settings writes that also drive other effects still behave faithfully.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { buildStore, type ReconcileSpies } from './reconcileSagaHarness';
import { setGalaxyCatalogSize } from '../../../src/state/settings/settingsSlice';
import { beginDrag, setAutoRotate } from '../../../src/state/camera/cameraSlice';
import { setTier } from '../../../src/state/tier/tierSlice';

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

  // ── WAKE_ROUTES — camera writes wake the loop; unrelated routes do not ───────
  // watchWakeSaga matches the WAKE_ROUTES set (settings + camera). A camera-slice
  // write must poke the passive scheduler; a write to a non-wake route (tier)
  // must not.

  it('a camera slice write (beginDrag) wakes the loop', () => {
    store.dispatch(beginDrag());

    expect(reconcile.requestRender).toHaveBeenCalledTimes(1);
  });

  it('a camera slice write (setAutoRotate) wakes the loop', () => {
    store.dispatch(setAutoRotate({ active: true, rate: 0.001 }));

    expect(reconcile.requestRender).toHaveBeenCalledTimes(1);
  });

  it('a tier write does NOT wake the loop (tier is not a WAKE_ROUTE)', () => {
    store.dispatch(setTier('large'));

    expect(reconcile.requestRender).not.toHaveBeenCalled();
  });
});
