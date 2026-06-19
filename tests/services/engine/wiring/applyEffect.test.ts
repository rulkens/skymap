/**
 * applyEffect — unit tests for the tour's silent partial-settings apply.
 *
 * The bridge (`syncVisibilityFades`) is mocked to a typed spy so these tests
 * assert applyEffect's own contract: write ONLY the patched clusters back onto
 * the settings store THROUGH `store.dispatch` (one copy-on-write swap that
 * notifies React subscribers, detached from the Readonly patch), then sync ONLY
 * the fade keys whose `row.cluster` is in the patch — the cluster→keys map
 * DERIVED from the manifest, not a parallel table. The bridge's fade behaviour
 * is its own suite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { SettingsSnapshot } from '../../../../src/@types/engine/settings/SettingsSnapshot';
import type { AppStore } from '../../../../src/store/types';
import { createAppStore } from '../../../../src/store/createAppStore';
import { syncVisibilityFades } from '../../../../src/services/engine/wiring/syncVisibilityFades';
import { applyEffect } from '../../../../src/services/engine/wiring/applyEffect';
import { makeSettingsFixture } from '../../../state/settings/makeSettingsFixture';

vi.mock('../../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades:
    vi.fn<
      typeof import('../../../../src/services/engine/wiring/syncVisibilityFades').syncVisibilityFades
    >(),
}));

const bridge = vi.mocked(syncVisibilityFades);

function makeHarness(): { store: AppStore; state: EngineState } {
  const { store } = createAppStore({ settings: makeSettingsFixture() });
  const state = {
    get settings() {
      return store.getState().settings;
    },
  } as unknown as EngineState;
  return { store, state };
}

/** The `only` array the bridge was last called with. */
function lastOnly(): readonly string[] {
  const [, opts] = bridge.mock.calls[bridge.mock.calls.length - 1]!;
  return (opts as { only: readonly string[] }).only;
}

describe('applyEffect', () => {
  beforeEach(() => bridge.mockClear());

  it('syncs only the touched rows (single-cluster patch)', () => {
    const { store, state } = makeHarness();
    const patch = {
      filaments: { enabled: true, intensity: 1 },
    } as unknown as Partial<SettingsSnapshot>;

    applyEffect(state, store, patch, { animate: true });

    expect(bridge).toHaveBeenCalledTimes(1);
    const only = lastOnly();
    expect(only).toContain('filaments');
    // No other cluster's rows came along.
    for (const k of [
      'survey',
      'surveyLabel',
      'structureRing',
      'structureLabel',
      'volumeField',
      'volumesMaster',
      'milkyWayDisk',
      'milkyWayLabel',
      'flow',
    ]) {
      expect(only).not.toContain(k);
    }

    // The patched cluster landed in the store; the others stayed at their live values.
    expect(state.settings.filaments).toEqual({ enabled: true, intensity: 1 });
    expect(state.settings.flow.enabled).toBe(makeSettingsFixture().flow.enabled);
  });

  it('notifies the store with one copy-on-write swap (the staleness fix)', () => {
    const { store, state } = makeHarness();
    const listener = vi.fn<() => void>();
    store.subscribe(listener);

    applyEffect(
      state,
      store,
      { filaments: { enabled: true, intensity: 1 } } as unknown as Partial<SettingsSnapshot>,
      { animate: true },
    );

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('detaches the patched cluster from the patch', () => {
    const { store, state } = makeHarness();
    const patch = {
      filaments: { enabled: true, intensity: 1 },
    } as unknown as Partial<SettingsSnapshot>;
    applyEffect(state, store, patch, { animate: false });

    (patch.filaments as { intensity: number }).intensity = 999;
    expect(state.settings.filaments.intensity).toBe(1);
  });

  it('maps a structures patch to BOTH structure rows and nothing else', () => {
    const { store, state } = makeHarness();
    const patch = {
      structures: { enabled: true, items: {} },
    } as unknown as Partial<SettingsSnapshot>;

    applyEffect(state, store, patch, { animate: true });

    const only = lastOnly();
    expect(only).toContain('structureRing');
    expect(only).toContain('structureLabel');
    for (const k of [
      'survey',
      'surveyLabel',
      'filaments',
      'volumeField',
      'volumesMaster',
      'milkyWayDisk',
      'milkyWayLabel',
      'flow',
    ]) {
      expect(only).not.toContain(k);
    }
  });
});
