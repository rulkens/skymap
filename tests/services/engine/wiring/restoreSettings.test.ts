/**
 * restoreSettings — unit tests for the tour's silent settings-restore close.
 *
 * The bridge (`syncVisibilityFades`) is mocked to a typed spy so these tests
 * assert restoreSettings' own contract: write the six clusters back onto the
 * settings store THROUGH `store.dispatch` (one copy-on-write swap that notifies
 * React subscribers — never an in-place mutation that leaves the panel stale),
 * detached from the Readonly snapshot, then one bridge pass over ALL rows (no
 * `only`). The bridge's fade behaviour is covered by its own suite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { SettingsSnapshot } from '../../../../src/@types/engine/settings/SettingsSnapshot';
import type { AppStore } from '../../../../src/store/types';
import { createAppStore } from '../../../../src/store/createAppStore';
import { syncVisibilityFades } from '../../../../src/services/engine/wiring/syncVisibilityFades';
import { restoreSettings } from '../../../../src/services/engine/wiring/restoreSettings';
import { makeSettingsFixture } from '../settingsStore/makeSettingsFixture';

vi.mock('../../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades:
    vi.fn<
      typeof import('../../../../src/services/engine/wiring/syncVisibilityFades').syncVisibilityFades
    >(),
}));

const bridge = vi.mocked(syncVisibilityFades);

/**
 * A real settings store plus a `state` whose `settings` getter delegates to it —
 * mirrors the engine's `get settings() { return store.getState().settings }` so a
 * `dispatch` write is observable through `state.settings`.
 */
function makeHarness(): { store: AppStore; state: EngineState } {
  const store = createAppStore({ settings: makeSettingsFixture() });
  const state = {
    get settings() {
      return store.getState().settings;
    },
  } as unknown as EngineState;
  return { store, state };
}

/** A snapshot whose six clusters differ from the fixture, so a restore is observable. */
function makeSnapshot(): SettingsSnapshot {
  const f = makeSettingsFixture();
  return {
    galaxyCatalogs: { ...f.galaxyCatalogs, enabled: !f.galaxyCatalogs.enabled },
    structures: { ...f.structures, enabled: !f.structures.enabled },
    volumes: { ...f.volumes, enabled: !f.volumes.enabled },
    filaments: { ...f.filaments, intensity: 0.42 },
    milkyWay: { ...f.milkyWay, enabled: !f.milkyWay.enabled },
    flow: { ...f.flow, flowSpeed: 7 },
  };
}

describe('restoreSettings', () => {
  beforeEach(() => bridge.mockClear());

  it('restores the clusters then syncs all rows (no `only`)', () => {
    const { store, state } = makeHarness();
    const snapshot = makeSnapshot();

    restoreSettings(state, store, snapshot, { animate: true });

    // Bridge called exactly once, animate forwarded, NO `only` key (full restore).
    expect(bridge).toHaveBeenCalledTimes(1);
    const [, opts] = bridge.mock.calls[0]!;
    expect(opts).toEqual({ animate: true });
    expect('only' in opts).toBe(false);

    // The flow cluster now deep-equals the snapshot's (read back through the store).
    expect(state.settings.flow).toEqual(snapshot.flow);
    expect(state.settings.milkyWay.enabled).toBe(snapshot.milkyWay.enabled);
  });

  it('notifies the store with one copy-on-write swap (the staleness fix)', () => {
    const { store, state } = makeHarness();
    const listener = vi.fn<() => void>();
    store.subscribe(listener);

    restoreSettings(state, store, makeSnapshot(), { animate: true });

    // A single dispatch swap — React subscribers wake exactly once, not zero
    // times (the in-place-mutation bug) nor once-per-cluster (a thrash).
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('detaches the restored clusters from the snapshot', () => {
    const { store, state } = makeHarness();
    const snapshot = makeSnapshot();
    restoreSettings(state, store, snapshot, { animate: false });

    // Mutating the snapshot after restore must NOT bleed into live settings.
    (snapshot.flow as { flowSpeed: number }).flowSpeed = 999;
    expect(state.settings.flow.flowSpeed).toBe(7);
  });

  it('writes the store before the bridge reads it', () => {
    const { store, state } = makeHarness();
    let flowAtBridge: number | undefined;
    bridge.mockImplementationOnce((s) => void (flowAtBridge = s.settings.flow.flowSpeed));

    restoreSettings(state, store, makeSnapshot(), { animate: true });

    // The bridge sees the already-restored intent, not the pre-restore value.
    expect(flowAtBridge).toBe(7);
  });
});
