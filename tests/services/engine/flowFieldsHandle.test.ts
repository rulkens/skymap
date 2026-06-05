/**
 * flowFieldsHandle — unit tests for the engine's `flow` sub-handle behaviour.
 *
 * The handle itself is built inline inside `createEngine` (it closes over
 * `state` + `boringSetters` + `reevaluateDemand`), and `createEngine` needs a
 * real GPUDevice, so we can't instantiate it in Node. Instead we test the two
 * halves the handle is composed of, exactly as `engine.ts` composes them:
 *
 *   1. The CLAMPS — owned by the table-driven `boringSetters`. We build those
 *      from the real `SETTINGS_TABLE` via `buildSettersFromTable` against a
 *      state stub and assert the [0,1] / [0,MAX_PARTICLES] bounds.
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
import {
  buildSettersFromTable,
  SETTINGS_TABLE,
} from '../../../src/services/engine/wiring/settingsTable';
import { MAX_PARTICLES } from '../../../src/services/gpu/renderers/flowFieldConstants';
import {
  FADE_IN_DURATION_MS,
  FADE_OUT_DURATION_MS,
} from '../../../src/services/animation/fadeController';
import type { EngineCallbacks } from '../../../src/@types/engine/EngineCallbacks';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { FlowMode } from '../../../src/@types/data/FlowMode';
import type { EngineFlowFieldsHandle } from '../../../src/@types/engine/handles/EngineFlowFieldsHandle';

/**
 * Default flow settings slice — the spike's hand-dialled advect look.
 * `enabled` / `loaded` are overridden per test.
 */
function makeFlowSettings() {
  return {
    enabled: false,
    mode: 'advect' as FlowMode,
    intensity: 0.7,
    count: 40000,
    trail: 0.003,
    flowSpeed: 0.06,
    densityBias: 1,
    wander: 0.15,
  };
}

/** Mutable state stub exposing exactly the slices the flow handle reads. */
function makeState(over: { loaded?: boolean } = {}) {
  const reseed = vi.fn();
  const requestRender = vi.fn();
  const fadeTo = vi.fn(async () => {});
  const state = {
    settings: { flow: makeFlowSettings() },
    data: { flow: { loaded: over.loaded ?? false } },
    gpu: { flowFieldRenderer: { maybeReseed: reseed } },
    subsystems: {
      fades: { fadeTo },
      scheduler: { requestRender },
    },
  } as unknown as EngineState;
  return { state, reseed, requestRender, fadeTo };
}

/**
 * Build the table-driven `boringSetters` against the given state stub — the
 * same builder `engine.ts` uses, so the flow rows + clamps are the real ones.
 */
function makeBoringSetters(state: EngineState, requestRender: () => void) {
  return buildSettersFromTable(state, {} as EngineCallbacks, requestRender);
}

/**
 * Hand-built `flow` sub-handle closure mirroring the engine.ts object literal.
 * `reevaluateDemand` is injected so the test can spy on the demand re-eval
 * without importing the real (state-walking) implementation.
 */
function makeFlowHandle(
  state: EngineState,
  boringSetters: ReturnType<typeof makeBoringSetters>,
  reevaluateDemand: (s: EngineState) => void,
): EngineFlowFieldsHandle {
  return {
    setEnabled: (enabled) => {
      boringSetters.setFlowEnabled(enabled);
      reevaluateDemand(state);
      if (enabled) {
        if (state.data.flow.loaded) {
          void state.subsystems.fades.fadeTo({ kind: 'flow' }, 1, FADE_IN_DURATION_MS);
        }
      } else {
        void state.subsystems.fades.fadeTo({ kind: 'flow' }, 0, FADE_OUT_DURATION_MS);
      }
      state.subsystems.scheduler.requestRender();
    },
    setMode: (mode) => {
      boringSetters.setFlowMode(mode);
      state.gpu.flowFieldRenderer?.maybeReseed();
      state.subsystems.scheduler.requestRender();
    },
    setIntensity: (value) => boringSetters.setFlowIntensity(value),
    setCount: (value) => {
      boringSetters.setFlowCount(value);
      state.gpu.flowFieldRenderer?.maybeReseed();
      state.subsystems.scheduler.requestRender();
    },
    setTrail: (value) => boringSetters.setFlowTrail(value),
    setFlowSpeed: (value) => boringSetters.setFlowSpeed(value),
    setDensityBias: (value) => boringSetters.setFlowDensityBias(value),
    setWander: (value) => boringSetters.setFlowWander(value),
  };
}

/** Convenience: assemble state + setters + a spy-able demand + the handle. */
function harness(over: { loaded?: boolean } = {}) {
  const ctx = makeState(over);
  const reevaluateDemand = vi.fn();
  const boringSetters = makeBoringSetters(ctx.state, ctx.requestRender);
  const handle = makeFlowHandle(ctx.state, boringSetters, reevaluateDemand);
  return { ...ctx, reevaluateDemand, handle };
}

describe('flow sub-handle — setEnabled fade design', () => {
  it('first enable (cube NOT loaded): sets enabled, re-evaluates demand, requests render, does NOT fade (slot commit owns it)', () => {
    const h = harness({ loaded: false });
    h.handle.setEnabled(true);

    expect(h.state.settings.flow.enabled).toBe(true);
    expect(h.reevaluateDemand).toHaveBeenCalledWith(h.state);
    expect(h.requestRender).toHaveBeenCalled();
    // The slot commit owns the first-enable fade-in; the handle must not.
    expect(h.fadeTo).not.toHaveBeenCalled();
  });

  it('re-enable (cube already loaded): sets enabled AND fades in to 1', () => {
    const h = harness({ loaded: true });
    h.handle.setEnabled(true);

    expect(h.state.settings.flow.enabled).toBe(true);
    expect(h.fadeTo).toHaveBeenCalledWith({ kind: 'flow' }, 1, FADE_IN_DURATION_MS);
  });

  it('disable: sets enabled false AND fades out to 0', () => {
    const h = harness({ loaded: true });
    h.handle.setEnabled(false);

    expect(h.state.settings.flow.enabled).toBe(false);
    expect(h.fadeTo).toHaveBeenCalledWith({ kind: 'flow' }, 0, FADE_OUT_DURATION_MS);
  });
});

describe('flow sub-handle — reseed wrappers', () => {
  it('setMode sets mode, reseeds, and requests a render', () => {
    const h = harness();
    h.handle.setMode('streamline');

    expect(h.state.settings.flow.mode).toBe('streamline');
    expect(h.reseed).toHaveBeenCalledOnce();
    expect(h.requestRender).toHaveBeenCalled();
  });

  it('setCount sets count, reseeds, and requests a render', () => {
    const h = harness();
    h.handle.setCount(1000);

    expect(h.state.settings.flow.count).toBe(1000);
    expect(h.reseed).toHaveBeenCalledOnce();
    expect(h.requestRender).toHaveBeenCalled();
  });

  it('setIntensity sets intensity and requests a render but does NOT reseed', () => {
    const h = harness();
    h.handle.setIntensity(0.5);

    expect(h.state.settings.flow.intensity).toBe(0.5);
    expect(h.requestRender).toHaveBeenCalled();
    expect(h.reseed).not.toHaveBeenCalled();
  });
});

describe('flow sub-handle — clamps (via the real table rows)', () => {
  it('setIntensity clamps above 1 down to 1', () => {
    const h = harness();
    h.handle.setIntensity(5);
    expect(h.state.settings.flow.intensity).toBe(1);
  });

  it('setCount clamps below 0 up to 0', () => {
    const h = harness();
    h.handle.setCount(-10);
    expect(h.state.settings.flow.count).toBe(0);
  });

  it('setCount clamps + rounds above MAX_PARTICLES down to MAX_PARTICLES', () => {
    const h = harness();
    h.handle.setCount(MAX_PARTICLES + 9999);
    expect(h.state.settings.flow.count).toBe(MAX_PARTICLES);
  });
});

describe('flow table rows exist in SETTINGS_TABLE', () => {
  it('declares all eight flow setters', () => {
    const names = SETTINGS_TABLE.map((d) => d.name);
    for (const k of [
      'setFlowEnabled',
      'setFlowMode',
      'setFlowIntensity',
      'setFlowCount',
      'setFlowTrail',
      'setFlowSpeed',
      'setFlowDensityBias',
      'setFlowWander',
    ] as const) {
      expect(names).toContain(k);
    }
  });
});
