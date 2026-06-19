/**
 * makeReconcileEffects — unit tests for the ReconcileEffects factory.
 *
 * Strategy: build a minimal fake EngineState with typed spy subsystems that
 * cover only the slices the four closures touch. vi.mock syncVisibilityFades so
 * the syncFades test stays focused on the factory wiring, not the bridge's
 * FADE_LAYERS walk.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BiasMode } from '../../../../src/@types/data/galaxyCatalog/BiasMode';
import { makeReconcileEffects } from '../../../../src/services/engine/wiring/makeReconcileEffects';

// Mock the syncVisibilityFades module so syncFades tests don't need a real
// FADE_LAYERS walk or a fully populated settings tree.
vi.mock('../../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades:
    vi.fn<(state: unknown, opts: { animate: boolean; only?: readonly string[] }) => void>(),
}));

import { syncVisibilityFades } from '../../../../src/services/engine/wiring/syncVisibilityFades';

// ── Fake EngineState builder ──────────────────────────────────────────────────
//
// Only the slices the four closures touch are populated. Everything else is
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

  it("syncFades(['flow']) calls syncVisibilityFades with { animate: true, only: ['flow'] }", () => {
    const { state } = makeState();
    const effects = makeReconcileEffects(state);
    effects.syncFades(['flow']);
    expect(syncVisibilityFades).toHaveBeenCalledTimes(1);
    expect(syncVisibilityFades).toHaveBeenCalledWith(state, { animate: true, only: ['flow'] });
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
});
