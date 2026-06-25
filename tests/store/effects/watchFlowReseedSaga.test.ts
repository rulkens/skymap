/**
 * watchFlowReseedSaga tests — verifies that reseedFlow fires only when a setFlow
 * patch changes the particle count or flow mode, and is skipped for patch-only
 * writes (e.g. the enabled toggle).
 *
 * Runs under the shared reconcileSagaHarness (all four reconcile watchers), so
 * the setFlow fan-out into watchFadesSaga is present but asserted elsewhere.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { buildStore, type ReconcileSpies } from './reconcileSagaHarness';
import { setFlow } from '../../../src/state/settings/settingsSlice';

describe('watchFlowReseedSaga', () => {
  let store: ReturnType<typeof buildStore>['store'];
  let reconcile: ReconcileSpies;

  beforeEach(() => {
    const built = buildStore();
    store = built.store;
    reconcile = built.reconcile;
  });

  it('setFlow({count}) → reseedFlow called', () => {
    store.dispatch(setFlow({ count: 500 }));

    expect(reconcile.reseedFlow).toHaveBeenCalledTimes(1);
  });

  it('setFlow({mode}) → reseedFlow called', () => {
    store.dispatch(setFlow({ mode: 'advect' }));

    expect(reconcile.reseedFlow).toHaveBeenCalledTimes(1);
  });

  it('setFlow({enabled:true}) → reseedFlow NOT called', () => {
    // enabled-only patch: mode and count are both undefined → reseed guard
    // returns early.
    store.dispatch(setFlow({ enabled: true }));

    expect(reconcile.reseedFlow).not.toHaveBeenCalled();
  });
});
