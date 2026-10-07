/**
 * `starCatalogPlanner` — the once-scope row: reduce the frame to the GPU cut's
 * inputs and vote awake for `NODE_FADE_MS` after they last changed.
 */
import { describe, it, expect, vi } from 'vitest';

import { starCatalogPlanner } from '../../../src/layers/starCatalog/frame';
import type { StarCatalogRuntime } from '../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { StarCutInputs } from '../../../src/layers/starCatalog/@types/StarCutInputs';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { StarCatalog } from '../../../src/@types/data/starCatalog/StarCatalog';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { Source } from '../../../src/data/source';
import { NODE_FADE_MS } from '../../../src/data/starNodeFade';

const MID_BAND_PC = 1_000; // inside Gaia's crossfade band

function camAtPc(x: number): Vec3 {
  return [x * SCALE_UNITS.PC_TO_MPC, 0, 0];
}

// No `slabs`: the planner reduces such a view to an unpruned cut.
function makeView(camPos: Vec3, nowMs: number): FrameView {
  return {
    snapshot: { nowMs },
    drawCamPos: camPos,
    drawPxPerRad: 600,
    viewSlot: 0,
    viewKind: 'frame',
  } as unknown as FrameView;
}

function makeRuntime(loaded: boolean): StarCatalogRuntime {
  const catalog = { starCount: 0 } as unknown as StarCatalog;
  let cut: StarCutInputs | null = null;
  return {
    renderer: {
      loadedCatalogs: () =>
        (loaded ? [{ source: Source.GaiaStars, catalog }] : [])[Symbol.iterator](),
      setFrameCut: vi.fn((c: StarCutInputs | null) => {
        cut = c;
      }),
      getFrameCut: () => cut,
    },
  } as unknown as StarCatalogRuntime;
}

const STATE = {
  settings: {
    starCatalogs: {
      enabled: true,
      sizePx: 2.5,
      brightness: 1,
      refineThreshold: 0.05,
      glowOverlap: 1,
      aggregateIntensityCap: 0.06,
      items: { gaiaStars: { enabled: true, labelEnabled: false } },
    },
  },
} as unknown as PassState;
const SNAPSHOT = {} as unknown as ReadyFrameContext;

describe('starCatalogPlanner', () => {
  it('sets one cut per call, and clears it when no source is in band', () => {
    const runtime = makeRuntime(true);
    const planner = starCatalogPlanner(runtime);
    planner.plan(SNAPSHOT, [makeView(camAtPc(MID_BAND_PC), 0)], STATE);
    expect(runtime.renderer.getFrameCut()?.cut.sources).toHaveLength(1);

    const empty = makeRuntime(false);
    const vote = starCatalogPlanner(empty).plan(
      SNAPSHOT,
      [makeView(camAtPc(MID_BAND_PC), 0)],
      STATE,
    );
    expect(empty.renderer.getFrameCut()).toBeNull();
    expect(vote.awake).toBe(false);
  });

  it('stays awake for NODE_FADE_MS after the cut inputs last moved, then sleeps', () => {
    const planner = starCatalogPlanner(makeRuntime(true));
    const plan = (x: number, t: number) => planner.plan(SNAPSHOT, [makeView(camAtPc(x), t)], STATE);

    plan(MID_BAND_PC, 0);
    plan(MID_BAND_PC + 10, 1000); // moved
    expect(plan(MID_BAND_PC + 10, 1000 + NODE_FADE_MS - 1).awake).toBe(true);
    const settled = plan(MID_BAND_PC + 10, 1000 + NODE_FADE_MS);
    expect(settled.awake).toBe(false);
    expect(settled.settling).toBe(false);
  });
});
