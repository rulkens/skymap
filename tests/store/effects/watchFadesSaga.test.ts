/**
 * watchFadesSaga tests — verifies that every action in FADE_ROW drives
 * syncFades([key]) through the fade bridge.
 *
 * Runs under the shared reconcileSagaHarness (all four reconcile watchers).
 *
 * The synchronous-notify test pins a load-bearing invariant: RTK dispatch is
 * synchronous and the `takeEvery` worker runs AFTER the reducer, so when
 * syncFades fires it observes the POST-write settings value, not the stale one.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { buildStore, type ReconcileSpies } from './reconcileSagaHarness';
import {
  setMilkyWayEnabled,
  writeVolumeField,
  setFlowEnabled,
  setZoneOfAvoidanceEnabled,
  mergeSnapshot,
} from '../../../src/state/settings/settingsSlice';

describe('watchFadesSaga', () => {
  let store: ReturnType<typeof buildStore>['store'];
  let reconcile: ReconcileSpies;

  beforeEach(() => {
    const built = buildStore();
    store = built.store;
    reconcile = built.reconcile;
  });

  // ── setMilkyWayEnabled ─────────────────────────────────────────────────────

  it('setMilkyWayEnabled(true) → syncFades(["milkyWayDisk"]) called', () => {
    store.dispatch(setMilkyWayEnabled(true));

    expect(reconcile.syncFades).toHaveBeenCalledTimes(1);
    expect(reconcile.syncFades).toHaveBeenCalledWith(['milkyWayDisk']);
  });

  // ── synchronous-notify invariant: saga worker sees post-dispatch state ───────
  // RTK dispatch is synchronous; the saga `takeEvery` worker runs AFTER the
  // reducer. This confirms that when syncFades fires inside watchFadesSaga, it
  // observes the flipped `milkyWay.enabled` value, not the pre-dispatch stale
  // value. An assertion that only lives INSIDE the spy passes silently if the
  // spy is never called; the call-count check outside makes it fail loudly if
  // the worker never fires (preventing vacuous passes).

  it('synchronous-notify: when watchFadesSaga fires, store.getState() sees POST-WRITE settings', () => {
    const before = store.getState().settings.milkyWay.enabled;

    reconcile.syncFades.mockImplementationOnce(() => {
      expect(store.getState().settings.milkyWay.enabled).toBe(!before);
    });

    store.dispatch(setMilkyWayEnabled(!before));

    expect(reconcile.syncFades).toHaveBeenCalledTimes(1);
  });

  // ── writeVolumeField — row-driven: fires regardless of what changed ────────

  it('writeVolumeField contrast patch → syncFades(["volumeField"]) fired', () => {
    // 'cf4-density' is a production volume seeded by buildInitialSettings. Any
    // patch (here contrast-only) triggers the row-driven sync; the no-op guard
    // lives in the fade bridge, not this saga.
    store.dispatch(writeVolumeField({ id: 'cf4-density', patch: { contrast: 0.5 } }));

    expect(reconcile.syncFades).toHaveBeenCalledWith(['volumeField']);
  });

  it('writeVolumeField idempotent: second identical dispatch → syncFades fires again', () => {
    store.dispatch(writeVolumeField({ id: 'cf4-density', patch: { contrast: 0.5 } }));
    store.dispatch(writeVolumeField({ id: 'cf4-density', patch: { contrast: 0.5 } }));

    // Saga is row-driven; it fires on every dispatch. The bridge's own tests
    // cover the no-op-if-unchanged guard.
    expect(reconcile.syncFades).toHaveBeenCalledTimes(2);
    expect(reconcile.syncFades).toHaveBeenNthCalledWith(1, ['volumeField']);
    expect(reconcile.syncFades).toHaveBeenNthCalledWith(2, ['volumeField']);
  });

  // ── setFlowEnabled — fade fires when the master gate flips ─────────────────

  it('setFlowEnabled(true) → syncFades(["flow"]) called', () => {
    store.dispatch(setFlowEnabled(true));

    expect(reconcile.syncFades).toHaveBeenCalledWith(['flow']);
  });

  // ── setZoneOfAvoidanceEnabled — the single band+label toggle ───────────────
  // Regression coverage for the dead-toggle defect: Task 7 added the fade
  // rows in fadeLayers.ts but no FADE_ROW entry, so toggling wrote the store
  // and nothing ever called syncFades. This is the test that would have
  // caught it.

  it('setZoneOfAvoidanceEnabled(true) → syncFades(["zoneOfAvoidance"]) called', () => {
    store.dispatch(setZoneOfAvoidanceEnabled(true));

    expect(reconcile.syncFades).toHaveBeenCalledWith(['zoneOfAvoidance']);
  });

  // ── mergeSnapshot — bulk restore arm: re-fades every row (full pass) ────────
  // The tour scene-restore puts mergeSnapshot; this arm reacts with a full
  // syncFades() (no rows) so every layer re-fades to the merged intent — no
  // restore-specific engine effect needed.

  it('mergeSnapshot → syncFades() called with no rows (full pass)', () => {
    store.dispatch(mergeSnapshot({}));

    expect(reconcile.syncFades).toHaveBeenCalledTimes(1);
    expect(reconcile.syncFades).toHaveBeenCalledWith();
  });
});
