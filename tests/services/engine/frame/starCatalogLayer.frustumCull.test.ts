/**
 * starCatalogLayer — frustum-cull WIRING tests (Task 5). Tasks 1–4 built the
 * plane-extraction util, the sphere test, and the cull blocks in both the visual
 * and pick renderers; those receive `frustumPlanes` + `glowMarginAngleRad` as
 * draw args. This file pins only the load-bearing regression the wiring exists to
 * prevent: that the layer actually PLUMBS real per-frame planes + a positive
 * margin through to every renderer draw (the placeholder era passed
 * `null` / `0`, which silently disabled the cull).
 *
 * These are STRUCTURAL/positivity assertions, deliberately NOT a recomputed-plane
 * mirror and NOT the exact margin value — margin retuning (or a plane-extraction
 * refactor) must not break them; only un-plumbing them should.
 */

import { describe, it, expect, vi } from 'vitest';

import { starCatalogLayer } from '../../../../src/services/engine/frame/passes/starCatalogLayer';
import { DEFAULT_FOV_Y_RAD } from '../../../../src/services/engine/camera/cameraFraming';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { Source } from '../../../../src/data/source';
import { GAIA_STARS_ENTRY } from '../../../../src/data/sources/gaia-stars';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { StarCatalog } from '../../../../src/@types/data/starCatalog/StarCatalog';
import type { StarCatalogDrawArgs } from '../../../../src/@types/rendering/StarCatalogRenderer';
import type { StarCatalogPickDrawArgs } from '../../../../src/@types/rendering/StarCatalogPickRenderer';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

/** A camera down +z at the given heliocentric distance, in parsecs. */
function camAtPc(distPc: number): Vec3 {
  return [0, 0, distPc * SCALE_UNITS.PC_TO_MPC];
}

/** A fresh ctx per call — `prepareStarCut` memoises on the ctx object. */
function makeCtx(camPos: Readonly<Vec3>, nowMs = 0): ReadyFrameContext {
  return { drawCamPos: camPos, nowMs, fovYRad: DEFAULT_FOV_Y_RAD } as unknown as ReadyFrameContext;
}

/** A single-leaf catalog: `walkStarOctreeCut` returns one leaf draw. */
function makeCatalog(): StarCatalog {
  return {
    starCount: 1,
    nodeCount: 1,
    mortonBitsPerAxis: 9,
    cellEdgePc: 78,
    gridOrigin: [0, 0, 0],
    nodes: [{ mortonIndex: 0, level: 0, childMask: 0, firstRecord: 0, recordCount: 1 }],
    records: new Uint8Array(6),
  } as unknown as StarCatalog;
}

/** A spy visual renderer over the StarCatalogRenderer draw surface. */
function makeRenderer(loaded: readonly { source: number; catalog: StarCatalog }[]) {
  return {
    upload: vi.fn(),
    loadedCatalogs: vi.fn(() => loaded[Symbol.iterator]()),
    draw: vi.fn<(pass: GPURenderPassEncoder, args: StarCatalogDrawArgs) => void>(),
  };
}

/** A spy pick renderer over the StarCatalogPickRenderer draw surface. */
function makePickRenderer() {
  return {
    draw: vi.fn<(pass: GPURenderPassEncoder, args: StarCatalogPickDrawArgs) => void>(),
  };
}

function makeState(renderer: unknown, pickRenderer: unknown): EngineState {
  return {
    gpu: { starCatalogRenderer: renderer, starCatalogPickRenderer: pickRenderer },
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

/** A NEAR0 SlabView whose f64 slab vp is a well-formed, non-degenerate matrix. */
function makeNear0View(camPos: Vec3): SlabView {
  const slab: Slab = makeSlab();
  return { slab, vp: new Float32Array(16), camPos, viewportPx: [1280, 720] };
}

const { inner, outer } = GAIA_STARS_ENTRY.crossfadePc;
// Mid-band → the single leaf snaps to full node-fade on its first frame, so its
// opacity is the pure crossfade (> 0) and it survives into both draw streams.
const MID_BAND_PC = inner + (outer - inner) * 0.5;

describe('starCatalogLayer frustum cull wiring', () => {
  it('drawStream forwards extracted frustum planes and a positive margin', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]);
    const camPos = camAtPc(MID_BAND_PC);
    const view = makeNear0View(camPos);

    starCatalogLayer.draw(
      PASS_STUB,
      view,
      makeCtx(camPos),
      makeState(renderer, makePickRenderer()),
    );

    expect(renderer.draw).toHaveBeenCalledTimes(1);
    const args = renderer.draw.mock.calls[0]![1];
    expect(args.frustumPlanes).not.toBeNull();
    expect(args.frustumPlanes!.length).toBe(24);
    expect(args.glowMarginAngleRad).toBeGreaterThan(0);
  });

  it('drawPick forwards the same extracted planes and a positive margin', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]);
    const pickRenderer = makePickRenderer();
    const camPos = camAtPc(MID_BAND_PC);
    const view = makeNear0View(camPos);

    starCatalogLayer.drawPick!(PASS_STUB, view, makeCtx(camPos), makeState(renderer, pickRenderer));

    expect(pickRenderer.draw).toHaveBeenCalledTimes(1);
    const args = pickRenderer.draw.mock.calls[0]![1];
    expect(args.frustumPlanes).not.toBeNull();
    expect(args.frustumPlanes!.length).toBe(24);
    expect(args.glowMarginAngleRad).toBeGreaterThan(0);
  });
});
