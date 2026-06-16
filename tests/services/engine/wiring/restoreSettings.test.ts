/**
 * restoreSettings — unit tests for the tour's silent settings-restore close.
 *
 * The bridge (`syncVisibilityFades`) is mocked to a typed spy so these tests
 * assert restoreSettings' own contract: deep-assign the six clusters onto
 * `state.settings` (DETACHED from the Readonly snapshot), then one bridge pass
 * over ALL rows (no `only`), then the optional `cb` echo AFTER the sync. The
 * bridge's fade behaviour is covered by its own suite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { SettingsSnapshot } from '../../../../src/@types/engine/settings/SettingsSnapshot';
import { syncVisibilityFades } from '../../../../src/services/engine/wiring/syncVisibilityFades';
import { restoreSettings } from '../../../../src/services/engine/wiring/restoreSettings';

vi.mock('../../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades:
    vi.fn<
      typeof import('../../../../src/services/engine/wiring/syncVisibilityFades').syncVisibilityFades
    >(),
}));

const bridge = vi.mocked(syncVisibilityFades);

// A snapshot carrying all six clusters with distinguishable leaf values, so a
// detachment check (mutate snapshot → state unchanged) has teeth.
function makeSnapshot(): SettingsSnapshot {
  return {
    galaxyCatalogs: { enabled: true, items: {} },
    structures: { enabled: true, items: {} },
    volumes: { enabled: true, items: {} },
    filaments: { enabled: true, intensity: 1 },
    milkyWay: { enabled: true, labelEnabled: true },
    flow: { enabled: true, flowSpeed: 1 },
  } as unknown as SettingsSnapshot;
}

// A live state whose six clusters start at different values than the snapshot,
// so a successful restore is observable.
function makeState(): EngineState {
  return {
    settings: {
      galaxyCatalogs: { enabled: false, items: {} },
      structures: { enabled: false, items: {} },
      volumes: { enabled: false, items: {} },
      filaments: { enabled: false, intensity: 0 },
      milkyWay: { enabled: false, labelEnabled: false },
      flow: { enabled: false, flowSpeed: 0 },
    },
  } as unknown as EngineState;
}

describe('restoreSettings', () => {
  beforeEach(() => bridge.mockClear());

  it('deep-assigns clusters then syncs all rows (no `only`)', () => {
    const state = makeState();
    const snapshot = makeSnapshot();

    restoreSettings(state, snapshot, { animate: true });

    // Bridge called exactly once, animate forwarded, NO `only` key (full restore).
    expect(bridge).toHaveBeenCalledTimes(1);
    const [, opts] = bridge.mock.calls[0]!;
    expect(opts).toEqual({ animate: true });
    expect('only' in opts).toBe(false);

    // The flow cluster now deep-equals the snapshot's.
    expect(state.settings.flow).toEqual(snapshot.flow);
  });

  it('detaches the restored clusters from the snapshot', () => {
    const state = makeState();
    const snapshot = makeSnapshot();
    restoreSettings(state, snapshot, { animate: false });

    // Mutating the snapshot after restore must NOT bleed into live settings.
    (snapshot.flow as { flowSpeed: number }).flowSpeed = 999;
    expect(state.settings.flow.flowSpeed).toBe(1);
  });

  it('invokes the cb echo AFTER the bridge', () => {
    const order: string[] = [];
    bridge.mockImplementationOnce(() => void order.push('bridge'));
    const cb = vi.fn<() => void>(() => void order.push('cb'));

    restoreSettings(makeState(), makeSnapshot(), { animate: true }, cb);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['bridge', 'cb']);
  });

  it('omits cb safely when absent', () => {
    expect(() => restoreSettings(makeState(), makeSnapshot(), { animate: true })).not.toThrow();
    expect(bridge).toHaveBeenCalledTimes(1);
  });
});
