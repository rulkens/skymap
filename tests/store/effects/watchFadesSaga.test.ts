/**
 * Runs under the shared reconcileSagaHarness (all four reconcile watchers).
 *
 * The synchronous-notify test pins a load-bearing invariant: RTK dispatch is
 * synchronous and the `takeEvery` worker runs AFTER the reducer, so when syncFades
 * fires it observes the POST-write settings value, not the stale one.
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
import {
  VISIBILITY_ACTION_ROW,
  FADE_ROW,
} from '../../../src/services/animation/visibilityActionRow';

describe('watchFadesSaga', () => {
  let store: ReturnType<typeof buildStore>['store'];
  let reconcile: ReconcileSpies;

  beforeEach(() => {
    const built = buildStore();
    store = built.store;
    reconcile = built.reconcile;
  });

  it('setMilkyWayEnabled(true) → syncFades(["milkyWayDisk"]) called', () => {
    store.dispatch(setMilkyWayEnabled(true));

    expect(reconcile.syncFades).toHaveBeenCalledTimes(1);
    expect(reconcile.syncFades).toHaveBeenCalledWith(['milkyWayDisk']);
  });

  // An assertion living only INSIDE the spy passes silently when the spy is never
  // called; the call-count check outside is what makes a dead worker fail loudly.

  it('synchronous-notify: when watchFadesSaga fires, store.getState() sees POST-WRITE settings', () => {
    const before = store.getState().settings.milkyWay.enabled;

    reconcile.syncFades.mockImplementationOnce(() => {
      expect(store.getState().settings.milkyWay.enabled).toBe(!before);
    });

    store.dispatch(setMilkyWayEnabled(!before));

    expect(reconcile.syncFades).toHaveBeenCalledTimes(1);
  });

  it('writeVolumeField contrast patch → syncFades(["volumeField"]) fired', () => {
    // Any patch triggers the row-driven sync — the no-op guard lives in the fade
    // bridge, not this saga.
    store.dispatch(writeVolumeField({ id: 'cf4-density', patch: { contrast: 0.5 } }));

    expect(reconcile.syncFades).toHaveBeenCalledWith(['volumeField']);
  });

  it('writeVolumeField idempotent: second identical dispatch → syncFades fires again', () => {
    store.dispatch(writeVolumeField({ id: 'cf4-density', patch: { contrast: 0.5 } }));
    store.dispatch(writeVolumeField({ id: 'cf4-density', patch: { contrast: 0.5 } }));

    expect(reconcile.syncFades).toHaveBeenCalledTimes(2);
    expect(reconcile.syncFades).toHaveBeenNthCalledWith(1, ['volumeField']);
    expect(reconcile.syncFades).toHaveBeenNthCalledWith(2, ['volumeField']);
  });

  it('setFlowEnabled(true) → syncFades(["flow"]) called', () => {
    store.dispatch(setFlowEnabled(true));

    expect(reconcile.syncFades).toHaveBeenCalledWith(['flow']);
  });

  // The dead-toggle defect: a fade row with no matching FADE_ROW entry writes the
  // store and never calls syncFades.

  it('setZoneOfAvoidanceEnabled(true) → syncFades(["zoneOfAvoidance"]) called', () => {
    store.dispatch(setZoneOfAvoidanceEnabled(true));

    expect(reconcile.syncFades).toHaveBeenCalledWith(['zoneOfAvoidance']);
  });

  // The full pass is what lets a tour scene-restore need no bespoke engine effect.

  it('mergeSnapshot → syncFades() called with no rows (full pass)', () => {
    store.dispatch(mergeSnapshot({}));

    expect(reconcile.syncFades).toHaveBeenCalledTimes(1);
    expect(reconcile.syncFades).toHaveBeenCalledWith();
  });

  // Fails when two rows declare the same writer: the derivation is
  // last-write-wins, so a colliding second row would silently take over the
  // first row's FADE_ROW entry and this assertion would catch it failing.

  it('every FADE_ROW entry maps to the layer whose row declares that writer', () => {
    for (const [key, row] of Object.entries(VISIBILITY_ACTION_ROW)) {
      expect(row.writes === null || FADE_ROW[row.writes.type] === key).toBe(true);
    }
  });
});
