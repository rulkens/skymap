/**
 * The Layer's `frame` bias reconcile. `setMode` never resolves here, standing in
 * for the ~200 ms worker bake: a compare written against the subsystem's own
 * lagging mode would re-fire every frame for its duration, which no other test
 * would see.
 */
import { describe, it, expect, vi } from 'vitest';

import { frame } from '../../../src/layers/galaxyCatalog/frame';
import type { BiasMode } from '../../../src/@types/data/galaxyCatalog/BiasMode';
import type { GalaxyCatalogRuntime } from '../../../src/layers/galaxyCatalog/types/GalaxyCatalogRuntime';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';

// The reconcile runs before every other limb of `frame`, so the rest of the
// runtime is inert: no committed hi-res pair, a planner walk that does nothing.
function makeRuntime(startMode: BiasMode) {
  const setMode = vi.fn(() => new Promise<void>(() => {}));
  const runtime = {
    biasLastApplied: startMode,
    biasCorrection: { setMode },
    hiResFamous: { committed: () => null },
    catalogs: new Map(),
    famousMeta: [],
    diskPlannerWalk: { runFrame: vi.fn() },
    proceduralDisks: { beginFrame: vi.fn(() => ({})) },
    texturedDisks: { beginFrame: vi.fn(() => ({})), hasInFlightWork: () => false },
  } as unknown as GalaxyCatalogRuntime;
  return { runtime, setMode };
}

function makeState(mode: BiasMode): PassState {
  return {
    settings: {
      bias: { mode, absMagLimit: -19 },
      galaxyCatalogs: { sbScale: 1, sbMax: 1, brightness: 1 },
    },
    subsystems: { fades: { opacityOf: () => 1 } },
  } as unknown as PassState;
}

const CTX = {
  cam: {},
  visibleSourceMask: 0xffffffff,
  drawPxPerRad: 100,
  nowMs: 0,
} as unknown as ReadyFrameContext;

describe('galaxyCatalog frame — bias reconcile', () => {
  it('re-bakes once per bias-mode change, not once per frame', () => {
    const { runtime, setMode } = makeRuntime(0);
    const tick = frame(runtime);

    for (let i = 0; i < 3; i += 1) tick(CTX, makeState(0));
    expect(setMode).not.toHaveBeenCalled();

    for (let i = 0; i < 2; i += 1) tick(CTX, makeState(3));
    expect(setMode).toHaveBeenCalledTimes(1);
    expect(setMode).toHaveBeenCalledWith(3);
  });
});
