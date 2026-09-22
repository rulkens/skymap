/**
 * `frame` — the Layer's per-frame prelude: one `advanceStarFades` call, then
 * one `setFrameCut`. Fixture mirrors `readStarCut.test.ts`'s two-level
 * catalog (a leaf under an aggregate root) so a camera move between calls
 * flips cut membership and puts a node mid-fade.
 */
import { describe, it, expect, vi } from 'vitest';

import { frame } from '../../../src/layers/starCatalog/frame';
import type { StarCatalogRuntime } from '../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { StarCatalog } from '../../../src/@types/data/starCatalog/StarCatalog';
import type { PreparedStarCut } from '../../../src/layers/starCatalog/@types/PreparedStarCut';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { Source } from '../../../src/data/source';
import { NODE_FADE_MS } from '../../../src/data/starNodeFade';
import { fadeBand } from '../../../src/utils/math/fadeBand';
import { GAIA_STARS_ENTRY } from '../../../src/layers/starCatalog/sources/gaia-stars';

const PC_TO_MPC = SCALE_UNITS.PC_TO_MPC;
const { inner, outer } = GAIA_STARS_ENTRY.crossfadePc;

function camAtPcVec(pc: Readonly<Vec3>): Vec3 {
  return [pc[0] * PC_TO_MPC, pc[1] * PC_TO_MPC, pc[2] * PC_TO_MPC];
}

function makeCtx(camPos: Readonly<Vec3>, nowMs: number): FrameView {
  return {
    snapshot: { nowMs },
    drawCamPos: camPos,
    viewSlot: 0,
    viewKind: 'frame',
  } as unknown as FrameView;
}

// A leaf parented by a level-1 aggregate root, 10 kpc out; refines to the
// leaf when the camera sits on the box (CLOSE) and coarsens to the root
// aggregate off to the side (FAR) — both inside the crossfade band, so only
// cut membership flips (same fixture readStarCut.test.ts's fade tests use).
const CLOSE_PC: Vec3 = [10_000, 0, 0];
const FAR_PC: Vec3 = [10_000, 5_000, 0];

function makeTwoLevelCatalog(): StarCatalog {
  return {
    starCount: 1,
    nodeCount: 2,
    mortonBitsPerAxis: 9,
    cellEdgePc: 78,
    gridOrigin: [10_000, 0, 0],
    nodes: [
      { mortonIndex: 0, level: 0, childMask: 0, firstRecord: 0, recordCount: 1 },
      { mortonIndex: 0, level: 1, childMask: 0b1, firstRecord: 1, recordCount: 1 },
    ],
    records: new Uint8Array(12),
  } as unknown as StarCatalog;
}

function makeRuntime(catalog: StarCatalog): StarCatalogRuntime {
  return {
    renderer: {
      loadedCatalogs: vi.fn(() => [{ source: Source.GaiaStars, catalog }][Symbol.iterator]()),
      setFrameCut: vi.fn(),
    },
  } as unknown as StarCatalogRuntime;
}

function makeState(): PassState {
  return {
    settings: {
      starCatalogs: {
        enabled: true,
        sizePx: 2.5,
        brightness: 1.0,
        refineThreshold: 0.05,
        glowOverlap: 1.0,
        aggregateIntensityCap: 0.06,
        items: { gaiaStars: { enabled: true, labelEnabled: false } },
      },
    },
  } as unknown as PassState;
}

function crossfadeAt(pc: Readonly<Vec3>): number {
  return fadeBand({ fullAt: inner, goneAt: outer }, Math.hypot(pc[0], pc[1], pc[2]));
}

describe('starCatalog frame', () => {
  it('advances the ramps exactly once per call and hands the renderer one cut', () => {
    const runtime = makeRuntime(makeTwoLevelCatalog());
    const tick = frame(runtime);
    const state = makeState();

    tick([makeCtx(camAtPcVec(FAR_PC), 0)], state); // snap: root in, leaf out
    tick([makeCtx(camAtPcVec(CLOSE_PC), 50)], state); // leaf enters, mid-fade

    const setFrameCut = runtime.renderer.setFrameCut as ReturnType<typeof vi.fn>;
    expect(setFrameCut).toHaveBeenCalledTimes(2);

    const lastCut = setFrameCut.mock.calls[1]![0] as PreparedStarCut;
    expect(lastCut.sources).toHaveLength(1);
    const leafOpacity = lastCut.sources[0]!.leaf.opacity[0]!;
    expect(leafOpacity).toBeCloseTo(crossfadeAt(CLOSE_PC) * (50 / NODE_FADE_MS), 6);
  });

  it('votes settling: false even while a node is mid-fade', () => {
    const runtime = makeRuntime(makeTwoLevelCatalog());
    const tick = frame(runtime);
    const state = makeState();

    tick([makeCtx(camAtPcVec(FAR_PC), 0)], state);
    const vote = tick([makeCtx(camAtPcVec(CLOSE_PC), 50)], state);

    expect(vote.awake).toBe(true); // the leaf/root swap is mid-fade
    expect(vote.settling).toBe(false);
  });
});
