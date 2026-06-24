/**
 * makeReconcileEffects — unit tests for the ReconcileEffects factory.
 *
 * Strategy: build a minimal fake EngineState with typed spy subsystems that
 * cover only the slices the six closures touch. vi.mock syncVisibilityFades,
 * captureScene, and restoreScene so each closure test stays focused on the
 * factory wiring, not the deeper implementation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BiasMode } from '../../../../src/@types/data/galaxyCatalog/BiasMode';
import type { AppStore } from '../../../../src/store/types';
import type { SceneSnapshot } from '../../../../src/@types/engine/settings/SceneSnapshot';
import { makeReconcileEffects } from '../../../../src/services/engine/wiring/makeReconcileEffects';

// Mock the syncVisibilityFades module so syncFades tests don't need a real
// FADE_LAYERS walk or a fully populated settings tree.
vi.mock('../../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades:
    vi.fn<(state: unknown, opts: { animate: boolean; only?: readonly string[] }) => void>(),
}));

// Mock captureScene and restoreScene so closure tests assert the factory
// wiring without needing a fully populated settings tree or real store.
vi.mock('../../../../src/services/engine/wiring/captureScene', () => ({
  captureScene: vi.fn<(state: unknown) => SceneSnapshot>(),
}));
vi.mock('../../../../src/services/engine/wiring/restoreScene', () => ({
  restoreScene:
    vi.fn<
      (
        state: unknown,
        store: unknown,
        snapshot: SceneSnapshot,
        opts: { animate: boolean },
      ) => void
    >(),
}));

import { syncVisibilityFades } from '../../../../src/services/engine/wiring/syncVisibilityFades';
import { captureScene } from '../../../../src/services/engine/wiring/captureScene';
import { restoreScene } from '../../../../src/services/engine/wiring/restoreScene';

// ── Fake EngineState builder ──────────────────────────────────────────────────
//
// Only the slices the six closures touch are populated. Everything else is
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

// Minimal AppStore stub — only `dispatch` is needed; captureScene/restoreScene
// are mocked so the real store is never called.
const fakeStore = { dispatch: vi.fn<() => void>() } as unknown as AppStore;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('makeReconcileEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requestRender calls scheduler.requestRender', () => {
    const { state, requestRender } = makeState();
    const effects = makeReconcileEffects(state, fakeStore);
    effects.requestRender();
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it("syncFades(['flow']) calls syncVisibilityFades with { animate: true, only: ['flow'] }", () => {
    const { state } = makeState();
    const effects = makeReconcileEffects(state, fakeStore);
    effects.syncFades(['flow']);
    expect(syncVisibilityFades).toHaveBeenCalledTimes(1);
    expect(syncVisibilityFades).toHaveBeenCalledWith(state, { animate: true, only: ['flow'] });
  });

  it('reseedFlow calls flowFieldRenderer.maybeReseed', () => {
    const { state, maybeReseed } = makeState();
    const effects = makeReconcileEffects(state, fakeStore);
    effects.reseedFlow();
    expect(maybeReseed).toHaveBeenCalledTimes(1);
  });

  it('reseedFlow tolerates a null flowFieldRenderer — no throw', () => {
    const { state } = makeState({ flowFieldRenderer: null });
    const effects = makeReconcileEffects(state, fakeStore);
    expect(() => effects.reseedFlow()).not.toThrow();
  });

  it('bakeBias(1) calls biasCorrection.setMode(1)', () => {
    const { state, setMode } = makeState();
    const effects = makeReconcileEffects(state, fakeStore);
    effects.bakeBias(1);
    expect(setMode).toHaveBeenCalledTimes(1);
    expect(setMode).toHaveBeenCalledWith(1);
  });

  it('the reconcile bag exposes captureScene / restoreScene', () => {
    const { state } = makeState();

    // Stub captureScene to return a recognisable snapshot shape.
    const FAKE_SNAP: SceneSnapshot = {
      settings: {} as SceneSnapshot['settings'],
      focus: { type: 'structure', id: 'virgo-cluster' },
    };
    vi.mocked(captureScene).mockReturnValueOnce(FAKE_SNAP);

    const effects = makeReconcileEffects(state, fakeStore);

    // captureScene closure delegates to the module function with state.
    const snap = effects.captureScene();
    expect(captureScene).toHaveBeenCalledTimes(1);
    expect(captureScene).toHaveBeenCalledWith(state);
    expect(snap).toBe(FAKE_SNAP);

    // restoreScene closure delegates to the module function with state, store, snapshot, opts.
    effects.restoreScene(FAKE_SNAP, { animate: true });
    expect(restoreScene).toHaveBeenCalledTimes(1);
    expect(restoreScene).toHaveBeenCalledWith(state, fakeStore, FAKE_SNAP, { animate: true });
  });
});
