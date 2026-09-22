/**
 * starCatalogPass — frustum-cull WIRING tests (Task 5). Tasks 1–4 built the
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

import { starCatalogPass } from '../../../../../src/layers/starCatalog/passes/starCatalogPass';
import { DEFAULT_FOV_Y_RAD } from '../../../../../src/services/engine/camera/cameraFraming';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { Source } from '../../../../../src/data/source';
import { GAIA_STARS_ENTRY } from '../../../../../src/layers/starCatalog/sources/gaia-stars';
import { DEFAULT_STAR_SIZE_PX } from '../../../../../src/layers/starCatalog/state/defaults';
import { STAR_SIZE_REF_PX, STAR_GLOW_MIN_PX } from '../../../../../src/data/starCullSlack';
import { makeSlab } from '../../../../fixtures/makeSlab';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../../../src/@types/engine/frame/PassState';
import type { StarCatalogRuntime } from '../../../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { StarCatalog } from '../../../../../src/@types/data/starCatalog/StarCatalog';
import type { StarCatalogSettings } from '../../../../../src/@types/settings/StarCatalogSettings';
import type { StarCatalogDrawArgs } from '../../../../../src/layers/starCatalog/@types/StarCatalogDrawArgs';
import type { StarCatalogPickDrawArgs } from '../../../../../src/layers/starCatalog/@types/StarCatalogPickDrawArgs';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

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

/** A fresh ctx per call — `readStarCut` memoises on the ctx object. */
// A capture ctx: its cut draws at full opacity with no fade state to seed first
// (what the old slot-less fixture got implicitly, `undefined !== 0`).
function makeCtx(camPos: Readonly<Vec3>, nowMs = 0): FrameView {
  return {
    snapshot: { nowMs },
    drawCamPos: camPos,
    viewKind: 'capture',
    canvasSize: { width: 1280, height: 720 },
    drawPxPerRad: 623.5,
  } as unknown as FrameView;
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

function makeRuntime(renderer: unknown, pickRenderer: unknown): StarCatalogRuntime {
  return { renderer, pickRenderer } as unknown as StarCatalogRuntime;
}

function makeSettings(sizePx = 2.5): StarCatalogSettings {
  return {
    enabled: true,
    sizePx,
    brightness: 1.0,
    refineThreshold: 0.05,
    glowOverlap: 1.0,
    aggregateIntensityCap: 0.06,
    items: { gaiaStars: { enabled: true, labelEnabled: false } },
  } as unknown as StarCatalogSettings;
}

function makePassState(sizePx = 2.5): PassState {
  return { settings: { starCatalogs: makeSettings(sizePx) } } as unknown as PassState;
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

describe('starCatalogPass frustum cull wiring', () => {
  it('drawStream forwards extracted frustum planes and a positive margin', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]);
    const camPos = camAtPc(MID_BAND_PC);
    const view = makeNear0View(camPos);
    const pass = starCatalogPass(makeRuntime(renderer, makePickRenderer()));

    pass.draw!(PASS_STUB, view, makeCtx(camPos), makePassState());

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
    const pass = starCatalogPass(makeRuntime(renderer, pickRenderer));

    pass.drawPick!(PASS_STUB, view, makeCtx(camPos), makePassState());

    expect(pickRenderer.draw).toHaveBeenCalledTimes(1);
    const args = pickRenderer.draw.mock.calls[0]![1];
    expect(args.frustumPlanes).not.toBeNull();
    expect(args.frustumPlanes!.length).toBe(24);
    expect(args.glowMarginAngleRad).toBeGreaterThan(0);
  });

  // Regression for the STAR_SIZE_REF_PX/DEFAULT_STAR_SIZE_PX divergence: the
  // shader divides sizePx by STAR_SIZE_REF_PX (2.5), so at the DEFAULT sizePx
  // (4.7) the drawn glow is 1.88x the reference footprint. The CPU margin must
  // cover that same footprint or a false cull can wink a visible star out.
  it('drawStream forwards a leaf margin covering the shader footprint at the default sizePx', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]);
    const camPos = camAtPc(MID_BAND_PC);
    const view = makeNear0View(camPos);
    const pass = starCatalogPass(makeRuntime(renderer, makePickRenderer()));

    pass.draw!(PASS_STUB, view, makeCtx(camPos), makePassState(DEFAULT_STAR_SIZE_PX));

    const args = renderer.draw.mock.calls[0]![1];
    const radiansPerPx = DEFAULT_FOV_Y_RAD / view.viewportPx[1];
    const shaderFootprintPx = STAR_GLOW_MIN_PX * (DEFAULT_STAR_SIZE_PX / STAR_SIZE_REF_PX);
    expect(args.glowMarginAngleRad).toBeGreaterThanOrEqual(
      shaderFootprintPx * radiansPerPx - 1e-12,
    );
  });
});
