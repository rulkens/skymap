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
 *   2. The SIDE-EFFECT WRAPPERS — the demand re-eval, the split fade-in/out,
 *      and the reseed-on-mode/count. We hand-build a `flow` closure that mirrors
 *      `engine.ts`'s literal byte-for-byte and drive it with spies, asserting
 *      the observable effects (fade calls, reseed, requestRender, demand).
 *
 * Keeping the wrapper closure local to the test is the standard idiom here
 * (`setSourceVisibleForTest` is the export-for-test exception; most sub-handle
 * wrappers stay private and are validated through their effects).
 */

import { describe, it, expect, vi } from 'vitest';
import { setFlowAction } from '../../../src/services/engine/settingsStore/actions/setFlowAction';
import { createSettingsStore } from '../../../src/services/engine/settingsStore/createSettingsStore';
import type { SettingsStore } from '../../../src/services/engine/settingsStore/createSettingsStore';
import { makeSettingsFixture } from './settingsStore/makeSettingsFixture';
import { MAX_PARTICLES } from '../../../src/data/flow/flowFieldConstants';
import {
  FADE_IN_DURATION_MS,
  FADE_OUT_DURATION_MS,
} from '../../../src/services/animation/fadeController';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { EngineFlowFieldsHandle } from '../../../src/@types/engine/handles/EngineFlowFieldsHandle';
import { slotReady } from '../../../src/services/loading/slotReady';

/**
 * Mutable state stub exposing exactly the slices the flow handle reads. The
 * re-enable guard reads `slotReady(assetSlots.flow)`, so `loaded` is modelled as
 * the flow slot's `state().kind` ('ready' when the cube has committed).
 */
function makeState(over: { loaded?: boolean } = {}) {
  const reseed = vi.fn();
  const requestRender = vi.fn();
  const fadeTo = vi.fn(async () => {});
  const ready = over.loaded ?? false;
  const state = {
    assetSlots: {
      flow: { state: () => ({ kind: ready ? 'ready' : 'idle' }) },
    },
    gpu: { flowFieldRenderer: { maybeReseed: reseed } },
    subsystems: {
      fades: { fadeTo },
      scheduler: { requestRender },
    },
  } as unknown as EngineState;
  return { state, reseed, requestRender, fadeTo };
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

      // enabled: demand re-eval, then fade only when the cube is resident
      // (loaded ⟹ registered) — mirrors engine.ts. Guards the unregistered-
      // handle throw for toggles during the async bootstrap; first-enable
      // fade-in is owned by the slot commit.
      if (patch.enabled !== undefined) {
        reevaluateDemand(state);
        if (slotReady(state.assetSlots.flow)) {
          void state.subsystems.fades.fadeTo(
            { kind: 'flow' },
            patch.enabled ? 1 : 0,
            patch.enabled ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
          );
        }
      }

      // mode / count both reseed the shared particle buffers.
      if (patch.mode !== undefined || patch.count !== undefined) {
        state.gpu.flowFieldRenderer?.maybeReseed();
      }
    },
  };
}

/** Convenience: assemble state + store + a spy-able demand + the handle. */
function harness(over: { loaded?: boolean } = {}) {
  const ctx = makeState(over);
  const store = createSettingsStore(makeSettingsFixture());
  const reevaluateDemand = vi.fn();
  const handle = makeFlowHandle(ctx.state, store, reevaluateDemand);
  return { ...ctx, store, reevaluateDemand, handle };
}

describe('flow sub-handle — setEnabled fade design', () => {
  it('first enable (cube NOT loaded): sets enabled, re-evaluates demand, requests render, does NOT fade (slot commit owns it)', () => {
    const h = harness({ loaded: false });
    h.handle.set({ enabled: true });

    expect(h.store.getState().flow.enabled).toBe(true);
    expect(h.reevaluateDemand).toHaveBeenCalledWith(h.state);
    expect(h.requestRender).toHaveBeenCalled();
    // The slot commit owns the first-enable fade-in; the handle must not.
    expect(h.fadeTo).not.toHaveBeenCalled();
  });

  it('re-enable (cube already loaded): sets enabled AND fades in to 1', () => {
    const h = harness({ loaded: true });
    h.handle.set({ enabled: true });

    expect(h.store.getState().flow.enabled).toBe(true);
    expect(h.fadeTo).toHaveBeenCalledWith({ kind: 'flow' }, 1, FADE_IN_DURATION_MS);
  });

  it('disable (cube loaded): sets enabled false AND fades out to 0', () => {
    const h = harness({ loaded: true });
    h.handle.set({ enabled: false });

    expect(h.store.getState().flow.enabled).toBe(false);
    expect(h.fadeTo).toHaveBeenCalledWith({ kind: 'flow' }, 0, FADE_OUT_DURATION_MS);
  });

  it('disable (cube NOT loaded): clears enabled but does NOT fade', () => {
    // Guards the bootstrap window: a returning user skips the splash and can
    // toggle flow on→off before wireSlots registers the {kind:'flow'} fade.
    // fadeTo throws on an unregistered handle, and loaded===false proves the
    // commit (hence registration) has not run — so the handle must NOT fade.
    const h = harness({ loaded: false });
    h.handle.set({ enabled: false });

    expect(h.store.getState().flow.enabled).toBe(false);
    expect(h.fadeTo).not.toHaveBeenCalled();
    expect(h.requestRender).toHaveBeenCalled();
  });
});

describe('flow sub-handle — reseed wrappers', () => {
  it('setMode sets mode, reseeds, and requests a render', () => {
    const h = harness();
    h.handle.set({ mode: 'streamline' });

    expect(h.store.getState().flow.mode).toBe('streamline');
    expect(h.reseed).toHaveBeenCalledOnce();
    expect(h.requestRender).toHaveBeenCalled();
  });

  it('setCount sets count, reseeds, and requests a render', () => {
    const h = harness();
    h.handle.set({ count: 1000 });

    expect(h.store.getState().flow.count).toBe(1000);
    expect(h.reseed).toHaveBeenCalledOnce();
    expect(h.requestRender).toHaveBeenCalled();
  });

  it('setIntensity sets intensity and requests a render but does NOT reseed', () => {
    const h = harness();
    h.handle.set({ intensity: 0.5 });

    expect(h.store.getState().flow.intensity).toBe(0.5);
    expect(h.requestRender).toHaveBeenCalled();
    expect(h.reseed).not.toHaveBeenCalled();
  });
});

describe('flow sub-handle — stores raw intent (clamping moved to clampFlowParams)', () => {
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
