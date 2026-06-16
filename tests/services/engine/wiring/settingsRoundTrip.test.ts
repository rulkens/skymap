/**
 * settingsRoundTrip — the #38 ACCEPTANCE criterion: capture → restore is a
 * lossless round-trip.
 *
 * This exercises the REAL `captureSettings` / `restoreSettings` / `applyEffect`
 * together against a realistic six-cluster `state.settings`. The property under
 * test is pure SETTINGS FIDELITY: a capture, after being restored, deep-equals
 * the bytes that went in — no field is dropped, aliased, or reshaped through the
 * round-trip.
 *
 * ### Why the bridge is mocked
 *
 * `restoreSettings` / `applyEffect` write `state.settings` through the settings
 * store; the only thing the bridge (`syncVisibilityFades`) does is fire fades
 * off the just-written intent. The fade side-effect is irrelevant to settings
 * fidelity, so we mock the bridge to a typed no-op spy — restore/applyEffect
 * then do their store write with no fade machinery to stand up. The bridge's own
 * fade + post behaviour is covered by its own suite, not here.
 */

import { describe, it, expect, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { captureSettings } from '../../../../src/services/engine/wiring/captureSettings';
import { restoreSettings } from '../../../../src/services/engine/wiring/restoreSettings';
import { applyEffect } from '../../../../src/services/engine/wiring/applyEffect';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { SettingsStore } from '../../../../src/services/engine/settingsStore/createSettingsStore';

// Both restoreSettings and applyEffect import the bridge from this module; mock
// it once to a typed spy so the deep-assign runs but no fade machinery is hit.
vi.mock('../../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades:
    vi.fn<
      typeof import('../../../../src/services/engine/wiring/syncVisibilityFades').syncVisibilityFades
    >(),
}));

// ── Fixture factory ─────────────────────────────────────────────────────────
//
// A FRESH deep state per call so a mutation in one test can't bleed into another
// through a shared object. The six clusters carry NESTED, real-ish structure so
// deep-equality through the round-trip is a meaningful assertion: each `items`
// row is its own object, each cluster mixes visibility gates with look knobs.

function makeHarness(): { store: SettingsStore; state: EngineState } {
  const store = createStore(() => makeSettings());
  const state = {
    get settings() {
      return store.getState();
    },
  } as unknown as EngineState;
  return { store, state };
}

function makeSettings(): EngineSettingsState {
  return {
    galaxyCatalogs: {
      enabled: true,
      sizePx: 2.5,
      brightness: 1.1,
      depthFade: true,
      highlightFallback: false,
      realOnly: false,
      items: {
        sdss: { enabled: true, labelEnabled: false },
        glade: { enabled: false, labelEnabled: false },
      },
    },
    structures: {
      enabled: true,
      items: {
        cluster: { enabled: true, labelEnabled: true },
        supercluster: { enabled: false, labelEnabled: true },
      },
    },
    volumes: {
      enabled: true,
      items: {
        mcpm: { enabled: true, intensity: 0.8, palette: 'viridis' },
      },
    },
    filaments: {
      enabled: true,
      intensity: 0.6,
    },
    milkyWay: {
      enabled: true,
      labelEnabled: false,
    },
    flow: {
      enabled: false,
      intensity: 1.0,
      speed: 0.5,
    },
  } as unknown as EngineSettingsState;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('settings capture/restore round-trip (#38 acceptance)', () => {
  it('restores a mutated capture, then round-trips back to the original exactly', () => {
    const { store, state } = makeHarness();
    const original = captureSettings(state);

    // Mutate a detached clone — a flat cluster field and a nested items field —
    // so restore has something non-trivial to land.
    const mutated = structuredClone(original);
    mutated.flow.enabled = !mutated.flow.enabled;
    mutated.structures.items.cluster!.enabled = !mutated.structures.items.cluster!.enabled;

    restoreSettings(state, store, mutated, { animate: false });
    // Restore landed the mutation: a fresh capture matches the mutated bytes.
    expect(captureSettings(state)).toEqual(mutated);

    restoreSettings(state, store, original, { animate: false });
    // And it round-trips back to the original exactly — nothing lost.
    expect(captureSettings(state)).toEqual(original);
  });

  it('applies a partial effect patch and round-trips back', () => {
    const { store, state } = makeHarness();
    const original = captureSettings(state);

    // The patch type is Partial<SettingsSnapshot>; a present cluster must be a
    // COMPLETE cluster object, so spread the captured cluster and override one
    // field.
    applyEffect(
      state,
      store,
      { filaments: { ...original.filaments, enabled: !original.filaments.enabled } },
      { animate: false },
    );

    // The patched cluster's field changed…
    expect(captureSettings(state).filaments.enabled).toBe(!original.filaments.enabled);
    // …and an untouched cluster is byte-for-byte intact.
    expect(captureSettings(state).structures).toEqual(original.structures);

    restoreSettings(state, store, original, { animate: false });
    // A full restore wipes the effect: back to the original exactly.
    expect(captureSettings(state)).toEqual(original);
  });
});
