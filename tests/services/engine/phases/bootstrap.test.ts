/**
 * bootstrap — orchestrator-level unit test for `runBootstrapPhases`.
 *
 * The four phase modules (`initGpu`, `wireSlots`, `wireInput`,
 * `startLoop`) each lift a section of the pre-Phase-5 IIFE verbatim;
 * their content is exercised end-to-end by the existing engine
 * integration tests (engine.tier-swap-race, runFrame, renderFrame, …).
 *
 * This file is narrowly scoped to the orchestrator's contract:
 *   - phases run in declared order;
 *   - first rejection short-circuits the chain (later phases not
 *     invoked, error propagates to the caller);
 *   - state writes from earlier phases are visible to later phases.
 *
 * We mock each phase module via `vi.mock` so the test runs without a
 * GPU device, without `navigator.gpu`, and without any of the renderer
 * subsystems.  The mocks share a single `order: string[]` array each
 * phase pushes into; assertions read off that array.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────
//
// vi.mock is hoisted, so we declare the mocks here at module scope and
// reset them inside `beforeEach` to give every test a clean slate.  The
// shared `order` array lives in module scope so the mocks can push into
// it; tests read it after `runBootstrapPhases` resolves.
const order: string[] = [];

// `stateWrites` records which phase wrote which key, so we can assert
// "later phases see earlier phases' writes".  The mocks dispatch on
// state to demonstrate the propagation.
const stateWrites: Record<string, unknown> = {};

// Phase mocks.  Each pushes its name into `order` then optionally
// throws.  The `__phaseControl` object lets each test override
// behaviour without clobbering the underlying mock function (which
// vi.mock hoists).
const __phaseControl = {
  initGpu: { throw: false as Error | false, write: false },
  wireSlots: { throw: false as Error | false },
  wireInput: { throw: false as Error | false },
  startLoop: { throw: false as Error | false },
};

vi.mock('../../../../src/services/engine/phases/initGpu', () => ({
  initGpu: vi.fn(async (state: any, _deps: any) => {
    order.push('initGpu');
    if (__phaseControl.initGpu.write) {
      // Simulate a state write that later phases should be able to read.
      state.gpu.galaxyPointRenderer = { __mockRenderer: true };
      stateWrites.fromInitGpu = state.gpu.galaxyPointRenderer;
    }
    if (__phaseControl.initGpu.throw) throw __phaseControl.initGpu.throw;
  }),
}));

vi.mock('../../../../src/services/engine/phases/wireSlots', () => ({
  wireSlots: vi.fn(async (state: any, _deps: any) => {
    order.push('wireSlots');
    // Capture what initGpu wrote so the test can assert visibility.
    stateWrites.observedInWireSlots = state.gpu.galaxyPointRenderer;
    if (__phaseControl.wireSlots.throw) throw __phaseControl.wireSlots.throw;
  }),
}));

vi.mock('../../../../src/services/engine/phases/wireInput', () => ({
  wireInput: vi.fn(async (_state: any, _deps: any) => {
    order.push('wireInput');
    if (__phaseControl.wireInput.throw) throw __phaseControl.wireInput.throw;
  }),
}));

vi.mock('../../../../src/services/engine/phases/startLoop', () => ({
  startLoop: vi.fn(async (_state: any, _deps: any) => {
    order.push('startLoop');
    if (__phaseControl.startLoop.throw) throw __phaseControl.startLoop.throw;
  }),
}));

// Imported AFTER the mocks above so the orchestrator picks them up.
import { runBootstrapPhases } from '../../../../src/services/engine/phases/bootstrap';

/**
 * Build an `EngineState`-shaped fixture sufficient for the mocks to
 * write into and read from.  Cast through `unknown` because we only
 * touch fields the orchestrator's mocks read; the real EngineState
 * shape is enforced by the production phase modules' typing, not here.
 */
function makeState(): any {
  return {
    gpu: { galaxyPointRenderer: null },
  };
}

/** Build a stub `BootstrapDeps`; the mocks only inspect a few fields. */
function makeDeps(): any {
  return {
    canvas: { width: 100, height: 100 } as any,
    cb: {} as any,
    frameRef: { current: () => {} },
    detachControlsRef: { current: null },
    handleRef: { current: null },
    allSlots: new Map(),
  };
}

describe('runBootstrapPhases', () => {
  beforeEach(() => {
    order.length = 0;
    for (const k of Object.keys(stateWrites)) delete stateWrites[k];
    __phaseControl.initGpu.throw = false;
    __phaseControl.initGpu.write = false;
    __phaseControl.wireSlots.throw = false;
    __phaseControl.wireInput.throw = false;
    __phaseControl.startLoop.throw = false;
  });

  it('runs phases in the declared order: initGpu → wireSlots → wireInput → startLoop', async () => {
    await runBootstrapPhases(makeState(), makeDeps());
    expect(order).toEqual(['initGpu', 'wireSlots', 'wireInput', 'startLoop']);
  });

  it('first rejection short-circuits — initGpu throws → wireSlots/wireInput/startLoop NOT called', async () => {
    __phaseControl.initGpu.throw = new Error('initGpu boom');
    await expect(runBootstrapPhases(makeState(), makeDeps())).rejects.toThrow('initGpu boom');
    // Only the throwing phase ran; later phases are not invoked.
    expect(order).toEqual(['initGpu']);
  });

  it('first rejection short-circuits — wireSlots throws → wireInput/startLoop NOT called', async () => {
    __phaseControl.wireSlots.throw = new Error('wireSlots boom');
    await expect(runBootstrapPhases(makeState(), makeDeps())).rejects.toThrow('wireSlots boom');
    expect(order).toEqual(['initGpu', 'wireSlots']);
  });

  it('first rejection short-circuits — wireInput throws → startLoop NOT called', async () => {
    __phaseControl.wireInput.throw = new Error('wireInput boom');
    await expect(runBootstrapPhases(makeState(), makeDeps())).rejects.toThrow('wireInput boom');
    expect(order).toEqual(['initGpu', 'wireSlots', 'wireInput']);
  });

  it('state writes from earlier phases are visible to later phases', async () => {
    __phaseControl.initGpu.write = true;
    const state = makeState();
    await runBootstrapPhases(state, makeDeps());
    // initGpu wrote `state.gpu.galaxyPointRenderer`; wireSlots's mock captured the
    // freshly-written value via the same `state` reference.
    expect(stateWrites.fromInitGpu).toEqual({ __mockRenderer: true });
    expect(stateWrites.observedInWireSlots).toBe(stateWrites.fromInitGpu);
  });
});
