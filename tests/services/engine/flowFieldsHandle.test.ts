/**
 * setFlow — unit tests for the engine's `flow` sub-handle behaviour.
 *
 * `handle.flow.set(patch)` delegates to the module-scope `setFlow` handle, so
 * we test that function directly (it closes over nothing — it takes `state` +
 * the settings store). `createEngine` needs a real GPUDevice, so testing the
 * handle in isolation is also the only way to drive it in Node.
 *
 * The handle is two halves:
 *
 *   1. The STORE WRITE — the whole `Partial<FlowSettings>` patch is dispatched
 *      through the `setFlow` slice action (copy-on-write into `settings.flow`).
 *      The store stores the raw request verbatim; clamping lives in
 *      `clampFlowParams`, tested there.
 *
 *   2. The SIDE-EFFECT WRAPPERS — the fade bridge call (enabled patches) and
 *      the reseed-on-mode/count.
 *
 * The fade is driven by `syncVisibilityFades`, which reads the just-written
 * `settings.flow.enabled` intent and lets the flow manifest's resident-only
 * guard (`fieldLoaded()`) decide whether to drive. So the handle's contract is
 * "write the store, then call the bridge with `{ animate: true, only: ['flow']
 * }`" — the bridge's own fade + guard behaviour is covered by the bridge's
 * suite. We mock the bridge to a typed spy (same idiom as
 * `setSourceVisibleFade.test.ts`).
 *
 * The handle does NOT kick `reevaluateDemand` itself: `requestRender` wakes the
 * loop and the per-frame demand pass lazy-loads the velocity cube on first
 * enable (see runFrame's demand-re-eval seam — no setter triggers loading).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAppStore } from '../../../src/store/createAppStore';
import type { AppStore } from '../../../src/store/types';
import { makeSettingsFixture } from '../../state/settings/makeSettingsFixture';
import { MAX_PARTICLES } from '../../../src/data/flow/flowFieldConstants';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import { setFlow } from '../../../src/services/engine/handles/setFlow';
import { syncVisibilityFades } from '../../../src/services/engine/wiring/syncVisibilityFades';

// The bridge is the seam under test: mock it to a typed spy so the handle test
// asserts ONLY the handle's contract (write-then-bridge, knob-only skips the
// bridge). The bridge's own fade + resident-only guard is covered by its suite.
vi.mock('../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades:
    vi.fn<
      typeof import('../../../src/services/engine/wiring/syncVisibilityFades').syncVisibilityFades
    >(),
}));

const bridge = vi.mocked(syncVisibilityFades);

/**
 * Mutable state stub exposing exactly the slices the flow handle reads. With the
 * bridge mocked the fade/assetSlots internals are swallowed; the stub only needs
 * the reseed + scheduler subsystems the handle touches directly.
 */
function makeState(store: AppStore) {
  const reseed = vi.fn();
  const requestRender = vi.fn();
  const state = {
    // Mirror the engine's settings delegation so the bridge (and the
    // write-before-bridge assertion) reads the live, just-written intent.
    get settings() {
      return store.getState().settings;
    },
    gpu: { flowFieldRenderer: { maybeReseed: reseed } },
    subsystems: {
      scheduler: { requestRender },
    },
  } as unknown as EngineState;
  return { state, reseed, requestRender };
}

/** Convenience: assemble state + store. */
function harness() {
  const { store } = createAppStore({ settings: makeSettingsFixture() });
  const ctx = makeState(store);
  return { ...ctx, store };
}

describe('flow sub-handle — setEnabled drives the fade bridge', () => {
  beforeEach(() => bridge.mockClear());

  it('enable: writes intent, requests render, and calls the bridge', () => {
    const h = harness();
    setFlow(h.state, h.store, { enabled: true });

    expect(h.store.getState().settings.flow.enabled).toBe(true);
    expect(h.requestRender).toHaveBeenCalled();
    expect(bridge).toHaveBeenCalledWith(h.state, { animate: true, only: ['flow'] });
  });

  it('disable: clears intent and calls the bridge (the manifest guard skips when unloaded)', () => {
    const h = harness();
    setFlow(h.state, h.store, { enabled: false });

    expect(h.store.getState().settings.flow.enabled).toBe(false);
    expect(bridge).toHaveBeenCalledWith(h.state, { animate: true, only: ['flow'] });
  });

  it('writes the store BEFORE calling the bridge (the bridge reads the just-written intent)', () => {
    const h = harness();
    bridge.mockImplementationOnce((s) => {
      expect((s as EngineState).settings.flow.enabled).toBe(true);
    });
    setFlow(h.state, h.store, { enabled: true });
    expect(bridge).toHaveBeenCalledTimes(1);
  });
});

describe('flow sub-handle — reseed wrappers', () => {
  beforeEach(() => bridge.mockClear());

  it('setMode sets mode, reseeds, requests a render, and does NOT call the bridge', () => {
    const h = harness();
    setFlow(h.state, h.store, { mode: 'streamline' });

    expect(h.store.getState().settings.flow.mode).toBe('streamline');
    expect(h.reseed).toHaveBeenCalledOnce();
    expect(h.requestRender).toHaveBeenCalled();
    // Knob-only patch: no enabled key, so the fade bridge stays untouched.
    expect(bridge).not.toHaveBeenCalled();
  });

  it('setCount sets count, reseeds, requests a render, and does NOT call the bridge', () => {
    const h = harness();
    setFlow(h.state, h.store, { count: 1000 });

    expect(h.store.getState().settings.flow.count).toBe(1000);
    expect(h.reseed).toHaveBeenCalledOnce();
    expect(h.requestRender).toHaveBeenCalled();
    expect(bridge).not.toHaveBeenCalled();
  });

  it('setIntensity sets intensity and requests a render but does NOT reseed or call the bridge', () => {
    const h = harness();
    setFlow(h.state, h.store, { intensity: 0.5 });

    expect(h.store.getState().settings.flow.intensity).toBe(0.5);
    expect(h.requestRender).toHaveBeenCalled();
    expect(h.reseed).not.toHaveBeenCalled();
    expect(bridge).not.toHaveBeenCalled();
  });
});

describe('flow sub-handle — stores raw intent (clamping moved to clampFlowParams)', () => {
  beforeEach(() => bridge.mockClear());

  it('setIntensity stores a raw out-of-range value (clamping moved to clampFlowParams)', () => {
    const h = harness();
    setFlow(h.state, h.store, { intensity: 5 });
    expect(h.store.getState().settings.flow.intensity).toBe(5);
  });

  it('setCount stores a raw negative value', () => {
    const h = harness();
    setFlow(h.state, h.store, { count: -10 });
    expect(h.store.getState().settings.flow.count).toBe(-10);
  });

  it('setCount stores a raw value above MAX_PARTICLES', () => {
    const h = harness();
    setFlow(h.state, h.store, { count: MAX_PARTICLES + 9999 });
    expect(h.store.getState().settings.flow.count).toBe(MAX_PARTICLES + 9999);
  });
});
