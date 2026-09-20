/**
 * The Layer's `frame` settling vote. `settling` gates every sky capture's
 * per-frame re-bake, so a fetch that hangs on an unreachable thumbnail host
 * must NOT hold it true — measured at boot: 32 s of outstanding hips2fits
 * requests kept it true for ~1450 six-face sweeps of the solar-system row.
 * `awake` must still track the fetch, or the arrival never gets drawn.
 */
import { describe, it, expect, vi } from 'vitest';

import { frame } from '../../../src/layers/galaxyCatalog/frame';
import type { GalaxyCatalogRuntime } from '../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';

// Same inert fixture as the other `frame` reconcile tests: nothing committed,
// a no-op planner walk, no selection row — only the two disk-work predicates
// vary, which is what the vote reads.
function makeRuntime(work: { inFlight: boolean; fading: boolean }) {
  return {
    biasLastApplied: 0,
    biasCorrection: { setMode: vi.fn() },
    hiResFamous: { committed: () => null },
    catalogs: new Map(),
    famousMeta: [],
    catalogsVersion: 0,
    pgcAlias: { committed: () => null },
    publish: vi.fn(),
    diskPlannerWalk: { runFrame: vi.fn() },
    proceduralDisks: { beginFrame: vi.fn(() => ({})) },
    texturedDisks: {
      beginFrame: vi.fn(() => ({})),
      hasInFlightWork: () => work.inFlight,
      hasFadingContent: () => work.fading,
    },
  } as unknown as GalaxyCatalogRuntime;
}

const STATE = {
  settings: {
    bias: { mode: 0, absMagLimit: -19 },
    galaxyCatalogs: { sbScale: 1, sbMax: 1, brightness: 1 },
  },
  selectionRows: { select: null },
  subsystems: { fades: { opacityOf: () => 1 } },
} as unknown as PassState;

const CTX = {
  cam: {},
  visibleSourceMask: 0xffffffff,
  drawPxPerRad: 100,
  nowMs: 0,
} as unknown as ReadyFrameContext;

describe('galaxyCatalog frame — settling vote', () => {
  it('votes awake but NOT settling while a thumbnail fetch is merely outstanding', () => {
    const tick = frame(makeRuntime({ inFlight: true, fading: false }));
    expect(tick(CTX, STATE)).toEqual({ awake: true, settling: false });
  });

  it('votes settling while a landed thumbnail is inside its load fade', () => {
    const tick = frame(makeRuntime({ inFlight: true, fading: true }));
    expect(tick(CTX, STATE)).toEqual({ awake: true, settling: true });
  });

  it('votes neither once the fetches and fades are done', () => {
    const tick = frame(makeRuntime({ inFlight: false, fading: false }));
    expect(tick(CTX, STATE)).toEqual({ awake: false, settling: false });
  });
});
