/**
 * makeReconcileEffects — unit tests for the ReconcileEffects factory.
 *
 * Strategy: build a minimal fake EngineState with typed spy subsystems that
 * cover only the slices the closures touch. vi.mock syncVisibilityFades so each
 * closure test stays focused on the factory wiring, not the deeper bridge walk.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BiasMode } from '../../../../src/@types/data/galaxyCatalog/BiasMode';
import { makeReconcileEffects } from '../../../../src/services/engine/wiring/makeReconcileEffects';

// Mock the syncVisibilityFades module so the syncFades tests don't need a real
// FADE_LAYERS walk or a fully populated settings tree.
vi.mock('../../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades:
    vi.fn<(state: unknown, opts: { animate: boolean; only?: readonly string[] }) => void>(),
}));

// Mock the applySwapFormat phase so the forwarding test doesn't need a real
// gpu.renderTargets/uiCtx pair — see applySwapFormat.test.ts for that unit's
// own coverage.
vi.mock('../../../../src/services/engine/phases/applySwapFormat', () => ({
  applySwapFormat: vi.fn<(state: unknown, desired: GPUTextureFormat) => void>(),
}));

import { syncVisibilityFades } from '../../../../src/services/engine/wiring/syncVisibilityFades';
import { applySwapFormat } from '../../../../src/services/engine/phases/applySwapFormat';

// ── Fake EngineState builder ──────────────────────────────────────────────────
//
// Only the slices the closures touch are populated. Everything else is
// absent; `as unknown as EngineState` bridges the gap (matching the pattern
// used in syncVisibilityFades.test.ts and other wiring tests).

function makeState(overrides?: { flowFieldRenderer?: { maybeReseed: () => void } | null }): {
  state: EngineState;
  requestRender: ReturnType<typeof vi.fn<() => void>>;
  setMode: ReturnType<typeof vi.fn<(mode: BiasMode) => Promise<void>>>;
  maybeReseed: ReturnType<typeof vi.fn<() => void>>;
} {
  const requestRender = vi.fn<() => void>();
  const setMode = vi.fn<(mode: BiasMode) => Promise<void>>(() => Promise.resolve());
  const maybeReseed = vi.fn<() => void>();

  const flowFieldRenderer =
    overrides?.flowFieldRenderer !== undefined ? overrides.flowFieldRenderer : { maybeReseed };

  const state = {
    subsystems: {
      scheduler: { requestRender },
      biasCorrection: { setMode },
    },
    gpu: { flowFieldRenderer },
  } as unknown as EngineState;

  return { state, requestRender, setMode, maybeReseed };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('makeReconcileEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requestRender calls scheduler.requestRender', () => {
    const { state, requestRender } = makeState();
    const effects = makeReconcileEffects(state);
    effects.requestRender();
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it("syncFades(['flow']) narrows the pass to { animate: true, only: ['flow'] }", () => {
    const { state } = makeState();
    const effects = makeReconcileEffects(state);
    effects.syncFades(['flow']);
    expect(syncVisibilityFades).toHaveBeenCalledTimes(1);
    expect(syncVisibilityFades).toHaveBeenCalledWith(state, { animate: true, only: ['flow'] });
  });

  it('syncFades() with no rows runs a full pass (only: undefined)', () => {
    const { state } = makeState();
    const effects = makeReconcileEffects(state);
    effects.syncFades();
    expect(syncVisibilityFades).toHaveBeenCalledTimes(1);
    expect(syncVisibilityFades).toHaveBeenCalledWith(state, { animate: true, only: undefined });
  });

  it('reseedFlow calls flowFieldRenderer.maybeReseed', () => {
    const { state, maybeReseed } = makeState();
    const effects = makeReconcileEffects(state);
    effects.reseedFlow();
    expect(maybeReseed).toHaveBeenCalledTimes(1);
  });

  it('reseedFlow tolerates a null flowFieldRenderer — no throw', () => {
    const { state } = makeState({ flowFieldRenderer: null });
    const effects = makeReconcileEffects(state);
    expect(() => effects.reseedFlow()).not.toThrow();
  });

  it('bakeBias(1) calls biasCorrection.setMode(1)', () => {
    const { state, setMode } = makeState();
    const effects = makeReconcileEffects(state);
    effects.bakeBias(1);
    expect(setMode).toHaveBeenCalledTimes(1);
    expect(setMode).toHaveBeenCalledWith(1);
  });

  it("applySwapFormat('rgba16float') forwards to the applySwapFormat phase with state", () => {
    const { state } = makeState();
    const effects = makeReconcileEffects(state);
    effects.applySwapFormat('rgba16float');
    expect(applySwapFormat).toHaveBeenCalledTimes(1);
    expect(applySwapFormat).toHaveBeenCalledWith(state, 'rgba16float');
  });
});
