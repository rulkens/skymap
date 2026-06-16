/**
 * flowFieldsHandle — unit tests for the engine's `flow` sub-handle behaviour.
 *
 * The handle itself is built inline inside `createEngine` (it closes over
 * `state` + the settings store + `reevaluateDemand`), and `createEngine` needs a
 * real GPUDevice, so we can't instantiate it in Node. Instead we test the two
 * halves the handle is composed of, exactly as `engine.ts` composes them:
 *
 *   1. The STORE WRITE — the whole `Partial<FlowSettings>` patch is dispatched
 *      through `setFlowAction` (copy-on-write into `settings.flow`). The store
 *      stores the raw request verbatim; clamping lives in `clampFlowParams`,
 *      tested there.
 *
 *   2. The SIDE-EFFECT WRAPPERS — the demand re-eval, the fade bridge call, and
 *      the reseed-on-mode/count. We hand-build a `flow` closure that mirrors
 *      `engine.ts`'s literal byte-for-byte and drive it with spies.
 *
 * The fade is no longer driven by a direct `fadeTo` guarded by `slotReady`:
 * `engine.ts` hands the whole enabled-branch to `syncVisibilityFades`, which
 * reads the just-written `settings.flow.enabled` intent and lets the flow
 * manifest's resident-only guard (`fieldLoaded()`) decide whether to drive. So
 * the handle's contract here is "write the store, then call the bridge with
 * `{ animate: true, only: ['flow'] }`" — the bridge's own fade + guard
 * behaviour is covered by the bridge's suite. We mock the bridge to a typed spy
 * (same idiom as `setSourceVisibleFade.test.ts`).
 *
 * Keeping the wrapper closure local to the test is the standard idiom here
 * (`setSourceVisibleForTest` is the export-for-test exception; most sub-handle
 * wrappers stay private and are validated through their effects).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setFlowAction } from '../../../src/services/engine/settingsStore/actions/setFlowAction';
import { createSettingsStore } from '../../../src/services/engine/settingsStore/createSettingsStore';
import type { SettingsStore } from '../../../src/services/engine/settingsStore/createSettingsStore';
import { makeSettingsFixture } from './settingsStore/makeSettingsFixture';
import { MAX_PARTICLES } from '../../../src/data/flow/flowFieldConstants';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { EngineFlowFieldsHandle } from '../../../src/@types/engine/handles/EngineFlowFieldsHandle';
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
function makeState(store: SettingsStore) {
  const reseed = vi.fn();
  const requestRender = vi.fn();
  const state = {
    // Mirror the engine's settings delegation so the bridge (and the
    // write-before-bridge assertion) reads the live, just-written intent.
    get settings() {
      return store.getState();
    },
    gpu: { flowFieldRenderer: { maybeReseed: reseed } },
    subsystems: {
      scheduler: { requestRender },
    },
  } as unknown as EngineState;
  return { state, reseed, requestRender };
}

/**
 * Hand-built `flow` sub-handle closure mirroring the engine.ts `set(patch)`
 * literal. `reevaluateDemand` is injected so the test can spy on the demand
 * re-eval without importing the real (state-walking) implementation. The store
 * is the real settings store — the whole patch lands through `setFlowAction`,
 * exactly as the engine routes it.
 */
function makeFlowHandle(
  state: EngineState,
  store: SettingsStore,
  reevaluateDemand: (s: EngineState) => void,
): EngineFlowFieldsHandle {
  return {
    set: (patch) => {
      setFlowAction(store, patch);
      state.subsystems.scheduler.requestRender();

      // enabled: demand re-eval, then hand the fade to the bridge — the manifest's
      // resident-only guard (fieldLoaded) decides whether it drives. Mirrors
      // engine.ts.
      if (patch.enabled !== undefined) {
        reevaluateDemand(state);
        syncVisibilityFades(state, { animate: true, only: ['flow'] });
      }

      // mode / count both reseed the shared particle buffers.
      if (patch.mode !== undefined || patch.count !== undefined) {
        state.gpu.flowFieldRenderer?.maybeReseed();
      }
    },
  };
}

/** Convenience: assemble state + store + a spy-able demand + the handle. */
function harness() {
  const store = createSettingsStore(makeSettingsFixture());
  const ctx = makeState(store);
  const reevaluateDemand = vi.fn();
  const handle = makeFlowHandle(ctx.state, store, reevaluateDemand);
  return { ...ctx, store, reevaluateDemand, handle };
}

describe('flow sub-handle — setEnabled drives the fade bridge', () => {
  beforeEach(() => bridge.mockClear());

  it('enable: writes intent, re-evaluates demand, requests render, and calls the bridge', () => {
    const h = harness();
    h.handle.set({ enabled: true });

    expect(h.store.getState().flow.enabled).toBe(true);
    expect(h.reevaluateDemand).toHaveBeenCalledWith(h.state);
    expect(h.requestRender).toHaveBeenCalled();
    expect(bridge).toHaveBeenCalledWith(h.state, { animate: true, only: ['flow'] });
  });

  it('disable: clears intent and calls the bridge (the manifest guard skips when unloaded)', () => {
    const h = harness();
    h.handle.set({ enabled: false });

    expect(h.store.getState().flow.enabled).toBe(false);
    expect(bridge).toHaveBeenCalledWith(h.state, { animate: true, only: ['flow'] });
  });

  it('writes the store BEFORE calling the bridge (the bridge reads the just-written intent)', () => {
    const h = harness();
    bridge.mockImplementationOnce((s) => {
      expect((s as EngineState).settings.flow.enabled).toBe(true);
    });
    h.handle.set({ enabled: true });
    expect(bridge).toHaveBeenCalledTimes(1);
  });
});

describe('flow sub-handle — reseed wrappers', () => {
  beforeEach(() => bridge.mockClear());

  it('setMode sets mode, reseeds, requests a render, and does NOT call the bridge', () => {
    const h = harness();
    h.handle.set({ mode: 'streamline' });

    expect(h.store.getState().flow.mode).toBe('streamline');
    expect(h.reseed).toHaveBeenCalledOnce();
    expect(h.requestRender).toHaveBeenCalled();
    // Knob-only patch: no enabled key, so the fade bridge stays untouched.
    expect(bridge).not.toHaveBeenCalled();
  });

  it('setCount sets count, reseeds, requests a render, and does NOT call the bridge', () => {
    const h = harness();
    h.handle.set({ count: 1000 });

    expect(h.store.getState().flow.count).toBe(1000);
    expect(h.reseed).toHaveBeenCalledOnce();
    expect(h.requestRender).toHaveBeenCalled();
    expect(bridge).not.toHaveBeenCalled();
  });

  it('setIntensity sets intensity and requests a render but does NOT reseed or call the bridge', () => {
    const h = harness();
    h.handle.set({ intensity: 0.5 });

    expect(h.store.getState().flow.intensity).toBe(0.5);
    expect(h.requestRender).toHaveBeenCalled();
    expect(h.reseed).not.toHaveBeenCalled();
    expect(bridge).not.toHaveBeenCalled();
  });
});

describe('flow sub-handle — stores raw intent (clamping moved to clampFlowParams)', () => {
  beforeEach(() => bridge.mockClear());

  it('setIntensity stores a raw out-of-range value (clamping moved to clampFlowParams)', () => {
    const h = harness();
    h.handle.set({ intensity: 5 });
    expect(h.store.getState().flow.intensity).toBe(5);
  });

  it('setCount stores a raw negative value', () => {
    const h = harness();
    h.handle.set({ count: -10 });
    expect(h.store.getState().flow.count).toBe(-10);
  });

  it('setCount stores a raw value above MAX_PARTICLES', () => {
    const h = harness();
    h.handle.set({ count: MAX_PARTICLES + 9999 });
    expect(h.store.getState().flow.count).toBe(MAX_PARTICLES + 9999);
  });
});
