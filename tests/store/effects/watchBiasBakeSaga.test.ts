/**
 * watchBiasBakeSaga tests — verifies that a setBiasMode write forwards the new
 * mode to bakeBias, and that the same write also wakes the loop (settings is a
 * WAKE_ROUTE, so watchWakeSaga fires alongside).
 *
 * Runs under the shared reconcileSagaHarness (all four reconcile watchers).
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { buildStore, type ReconcileSpies } from './reconcileSagaHarness';
import { setBiasMode } from '../../../src/state/settings/settingsSlice';

describe('watchBiasBakeSaga', () => {
  let store: ReturnType<typeof buildStore>['store'];
  let reconcile: ReconcileSpies;

  beforeEach(() => {
    const built = buildStore();
    store = built.store;
    reconcile = built.reconcile;
  });

  it('setBiasMode(1) → bakeBias(1) called', () => {
    store.dispatch(setBiasMode(1));

    expect(reconcile.bakeBias).toHaveBeenCalledTimes(1);
    expect(reconcile.bakeBias).toHaveBeenCalledWith(1);
  });

  it('setBiasMode fires requestRender in addition to bakeBias', () => {
    // setBiasMode is a settings write → watchWakeSaga fires regardless.
    store.dispatch(setBiasMode(2));

    expect(reconcile.requestRender).toHaveBeenCalledTimes(1);
    expect(reconcile.bakeBias).toHaveBeenCalledWith(2);
  });
});
