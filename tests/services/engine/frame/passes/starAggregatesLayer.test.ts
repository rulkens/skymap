/**
 * starAggregatesLayer — the survey-star AGGREGATE stream into the half-res
 * offscreen. Its walk/fade/partition is `prepareStarCut` (tested in
 * `prepareStarCut.test.ts`); here we pin only that it shares the star gate and
 * records the AGGREGATE sub-stream (never the leaf one) into its pass.
 */

import { describe, it, expect, vi } from 'vitest';

import { starAggregatesLayer } from '../../../../../src/services/engine/frame/passes/starAggregatesLayer';
import { starCatalogLayer } from '../../../../../src/services/engine/frame/passes/starCatalogLayer';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { Source } from '../../../../../src/data/source';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { StarCatalog } from '../../../../../src/@types/data/starCatalog/StarCatalog';
import type { StarCatalogDrawArgs } from '../../../../../src/@types/rendering/StarCatalogRenderer';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const PC_TO_MPC = SCALE_UNITS.PC_TO_MPC;
const PASS_STUB = {
  setPipeline: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

// Root aggregate 10 kpc out, coarsened when the camera sits to the side.
const FAR_PC: Vec3 = [10_000, 5_000, 0];

function camAtPcVec(pc: Readonly<Vec3>): Vec3 {
  return [pc[0] * PC_TO_MPC, pc[1] * PC_TO_MPC, pc[2] * PC_TO_MPC];
}

// The layer reads its viewport via `sizeOf('star-aggregates')` — the fixture
// hardcodes the size the production table's scale: 2 implies for the 1280x720
// canvas below (floor(1280 / 2), floor(720 / 2)).
function makeCtx(camPos: Readonly<Vec3>, nowMs = 0): ReadyFrameContext {
  return {
    drawCamPos: camPos,
    nowMs,
    canvasSize: { width: 1280, height: 720 },
    renderTargets: {
      specs: [{ id: 'star-aggregates', scale: 2 }],
      sizeOf: (id: string) => {
        if (id !== 'star-aggregates') throw new Error(`fixture renderTargets: no size for '${id}'`);
        return { width: 640, height: 360 };
      },
    },
  } as unknown as ReadyFrameContext;
}

/** A dense level-0 leaf (3 stars) under a level-1 aggregate root. */
function makeAggregateCatalog(): StarCatalog {
  return {
    starCount: 3,
    nodeCount: 2,
    mortonBitsPerAxis: 9,
    cellEdgePc: 78,
    gridOrigin: [10_000, 0, 0],
    nodes: [
      { mortonIndex: 0, level: 0, childMask: 0, firstRecord: 0, recordCount: 3 },
      { mortonIndex: 0, level: 1, childMask: 0b1, firstRecord: 3, recordCount: 1 },
    ],
    records: new Uint8Array(4 * 6),
  };
}

function makeRenderer(loaded: readonly { source: number; catalog: StarCatalog }[]) {
  return {
    upload: vi.fn(),
    loadedCatalogs: vi.fn(() => loaded[Symbol.iterator]()),
    draw: vi.fn<(pass: GPURenderPassEncoder, args: StarCatalogDrawArgs) => void>(),
  };
}

function makeState(renderer: unknown): EngineState {
  return {
    gpu: { starCatalogRenderer: renderer },
    subsystems: { scheduler: { requestRender: vi.fn() } },
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
  } as unknown as EngineState;
}

function makeNear0View(camPos: Vec3): SlabView {
  const slab: Slab = {
    index: NEAR0,
    nearMpc: 0.0005,
    farMpc: 500,
    vp: Float64Array.from({ length: 16 }, (_, i) => i + 0.5),
    originRelative: true,
    precision: 'f64',
    reversedZ: false,
  };
  return { slab, vp: new Float32Array(16), camPos, viewportPx: [1280, 720] };
}

describe('starAggregatesLayer', () => {
  it('shares the star visibility gate (same enabled as star-catalog) and targets the offscreen', () => {
    expect(starAggregatesLayer.enabled).toBe(starCatalogLayer.enabled);
    expect(starAggregatesLayer.target).toBe('star-aggregates');
    expect(starAggregatesLayer.slab).toBe(NEAR0);
  });

  it('records the AGGREGATE stream (stream tag, isAggregate all 1) into its pass', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeAggregateCatalog() }]);
    const camPos = camAtPcVec(FAR_PC);
    starAggregatesLayer.draw(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(camPos),
      makeState(renderer),
    );

    expect(renderer.draw).toHaveBeenCalledTimes(1);
    const args = renderer.draw.mock.calls[0]![1];
    expect(args.stream).toBe('aggregate');
    expect(args.drawCount).toBeGreaterThan(0);
    // The flat arrays are reused grow-only buffers, so scan only `[0, drawCount)`.
    expect(args.isAggregate.subarray(0, args.drawCount).every((v) => v === 1)).toBe(true);
  });

  it('sizes sprites against the half-res offscreen, not the canvas', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeAggregateCatalog() }]);
    const camPos = camAtPcVec(FAR_PC);
    const view = makeNear0View(camPos);
    starAggregatesLayer.draw(PASS_STUB, view, makeCtx(camPos), makeState(renderer));

    const args = renderer.draw.mock.calls[0]![1];
    expect(args.viewportPx).toEqual([640, 360]);
    // The SlabView is one object shared by every layer in the render step;
    // this layer must copy it, not mutate it, or siblings drawing after it
    // would inherit the halved viewport.
    expect(view.viewportPx).toEqual([1280, 720]);
  });

  it('is a no-op when the renderer handle is null (pre-bootstrap)', () => {
    const camPos = camAtPcVec(FAR_PC);
    const state = makeState(null);
    expect(() =>
      starAggregatesLayer.draw(PASS_STUB, makeNear0View(camPos), makeCtx(camPos), state),
    ).not.toThrow();
  });
});
