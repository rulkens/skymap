/**
 * The Layer's `frame` work votes. Both read the LANDED half of the textured
 * planner's thumbnail work, never the outstanding-fetch half: `tileStream`
 * calls `requestRender()` on every settle (success AND failure), so an arrival
 * wakes a frame by itself and neither vote has to hold the loop open for a
 * fetch. Measured at boot: alasky hips2fits requests run to the 30 s deadline,
 * and voting them kept the loop at ~45 fps for 32 s with nothing to show.
 */
import { describe, it, expect, vi } from 'vitest';

import { frame } from '../../../src/layers/galaxyCatalog/frame';
import type { GalaxyCatalogRuntime } from '../../../src/layers/galaxyCatalog/types/GalaxyCatalogRuntime';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';

// Same inert fixture as the other `frame` reconcile tests: nothing committed,
// a no-op planner walk, no selection row — only the disk-work predicate
// varies, which is what the votes read.
function makeRuntime(fading: boolean) {
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
      hasFadingContent: () => fading,
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

describe('galaxyCatalog frame — work votes', () => {
  it('votes both while a landed thumbnail is inside its load fade', () => {
    const tick = frame(makeRuntime(true));
    expect(tick(CTX, STATE)).toEqual({ awake: true, settling: true });
  });

  // The regression this file exists for: a thumbnail host that hangs for its
  // whole 30 s deadline must cost neither a woken loop nor a sky re-bake. The
  // fixture has no `hasInFlightWork` at all — reading it here would throw.
  it('votes neither while a fetch is merely outstanding', () => {
    const tick = frame(makeRuntime(false));
    expect(tick(CTX, STATE)).toEqual({ awake: false, settling: false });
  });
});
