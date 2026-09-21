/**
 * Runs under the shared reconcileSagaHarness (all four reconcile watchers).
 *
 * The synchronous-notify test pins a load-bearing invariant: RTK dispatch is
 * synchronous and the `takeEvery` worker runs AFTER the reducer, so when syncFades
 * fires it observes the POST-write settings value, not the stale one.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { buildStore, type ReconcileSpies } from './reconcileSagaHarness';
import { setMilkyWayEnabled } from '../../../src/layers/milkyWay/state/milkyWay/slice';
import { writeVolumeField } from '../../../src/layers/volume/state/volumes/slice';
import { setZoneOfAvoidanceEnabled } from '../../../src/layers/zoneOfAvoidance/state/zoneOfAvoidance/slice';
import { mergeSnapshot } from '../../../src/state/settings/mergeSnapshotAction';
import { setAutoRotate } from '../../../src/state/camera/cameraSlice';

describe('watchFadesSaga', () => {
  let store: ReturnType<typeof buildStore>['store'];
  let reconcile: ReconcileSpies;

  beforeEach(() => {
    const built = buildStore();
    store = built.store;
    reconcile = built.reconcile;
  });

  // The per-key cases collapse into one shape: any settings write re-syncs
  // every row (Task 4's targetOf skip is what keeps this cheap — see Task 5).

  it('any settings write calls syncFades with no rows', () => {
    store.dispatch(setMilkyWayEnabled(true));
    expect(reconcile.syncFades).toHaveBeenCalledTimes(1);
    expect(reconcile.syncFades).toHaveBeenCalledWith();

    store.dispatch(writeVolumeField({ id: 'cf4-density', patch: { contrast: 0.5 } }));
    expect(reconcile.syncFades).toHaveBeenCalledTimes(2);
    expect(reconcile.syncFades).toHaveBeenNthCalledWith(2);

    store.dispatch(setZoneOfAvoidanceEnabled(true));
    expect(reconcile.syncFades).toHaveBeenCalledTimes(3);

    store.dispatch(mergeSnapshot({}));
    expect(reconcile.syncFades).toHaveBeenCalledTimes(4);
  });

  it('a non-settings write does not call syncFades', () => {
    store.dispatch(setAutoRotate({ active: true, rate: 1 }));
    expect(reconcile.syncFades).not.toHaveBeenCalled();
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
});
