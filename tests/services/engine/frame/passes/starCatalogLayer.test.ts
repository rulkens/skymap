/**
 * starCatalogLayer — unit tests for the survey (Gaia bin) star LEAF content
 * row. The walk / fade / partition that feeds both streams lives in
 * `prepareStarCut` and is tested in `prepareStarCut.test.ts`; here we pin only
 * the layer's own behaviour:
 *
 *   1. `enabled` delegates to `starCatalogVisible` — the toggles AND the
 *      recede-direction crossfade band that IS the far gate (full inside
 *      `crossfadePc.inner`, gone past `crossfadePc.outer`). A camera past
 *      `outer`, the master gate off, the per-item toggle off, or a null
 *      renderer all close the gate — opacity 0 ⇒ no render work.
 *
 *   2. `draw` records the LEAF stream only, computing the rebased vp ONCE and
 *      handing the IDENTICAL matrix to every source's `renderer.draw` (the
 *      shared-camera-uniform invariant), tagged `stream: 'leaf'`, forwarding
 *      the live size / brightness / glow-overlap / fog-cap scalars.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mat4d } from 'wgpu-matrix';

import {
  starCatalogLayer,
  prepareStarCut,
} from '../../../../../src/services/engine/frame/passes/starCatalogLayer';
import { rebaseViewProj } from '../../../../../src/utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../../src/utils/math/narrowMat4';
import { fadeBand } from '../../../../../src/utils/math/fadeBand';
import { starExposureRamp } from '../../../../../src/services/gpu/renderers/starCatalog/starExposureRamp';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { Source } from '../../../../../src/data/source';
import { GAIA_STARS_ENTRY } from '../../../../../src/data/sources/gaia-stars';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import { vrOverride } from '../../../../../src/services/xr/vrSpikeState';
import type { VrEye } from '../../../../../src/services/xr/vrSpikeState';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { StarCatalog } from '../../../../../src/@types/data/starCatalog/StarCatalog';
import type { StarCatalogDrawArgs } from '../../../../../src/@types/rendering/StarCatalogRenderer';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

const CTX_STUB = {} as ReadyFrameContext;

/** A camera down +z at the given heliocentric distance, in parsecs. */
function camAtPc(distPc: number): Vec3 {
  return [0, 0, distPc * SCALE_UNITS.PC_TO_MPC];
}

/**
 * A fresh ctx per call — `prepareStarCut` memoises on the ctx object, so a
 * distinct object per frame keeps every draw a clean recompute.
 */
function makeCtx(camPos: Readonly<Vec3>, nowMs = 0): ReadyFrameContext {
  return { drawCamPos: camPos, nowMs } as unknown as ReadyFrameContext;
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
  };
}

/** A spy renderer over the StarCatalogRenderer draw surface. */
function makeRenderer(loaded: readonly { source: number; catalog: StarCatalog }[]) {
  return {
    upload: vi.fn(),
    loadedCatalogs: vi.fn(() => loaded[Symbol.iterator]()),
    draw: vi.fn<(pass: GPURenderPassEncoder, args: StarCatalogDrawArgs) => void>(),
  };
}

function makeState(
  renderer: unknown,
  opts: {
    master?: boolean;
    item?: boolean;
    size?: number;
    brightness?: number;
    refineThreshold?: number;
    glowOverlap?: number;
    aggregateIntensityCap?: number;
  } = {},
): EngineState {
  const {
    master = true,
    item = true,
    size = 2.5,
    brightness = 1.0,
    refineThreshold = 0.05,
    glowOverlap = 1.0,
    aggregateIntensityCap = 0.06,
  } = opts;
  return {
    gpu: { starCatalogRenderer: renderer },
    subsystems: { scheduler: { requestRender: vi.fn() } },
    settings: {
      starCatalogs: {
        enabled: master,
        sizePx: size,
        brightness,
        refineThreshold,
        glowOverlap,
        aggregateIntensityCap,
        items: { gaiaStars: { enabled: item, labelEnabled: false } },
      },
    },
  } as unknown as EngineState;
}

/**
 * A NEAR0 SlabView whose f64 `slab.vp` and f32 `vp` are DIFFERENT arrays, so
 * an identity check reveals the layer rebases off the f64 slab vp, not the
 * pre-narrowed `view.vp`.
 */
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

const { inner, outer } = GAIA_STARS_ENTRY.crossfadePc;

afterEach(() => {
  vrOverride.active = false;
  vrOverride.eyes = [];
});

describe('starCatalogLayer.enabled', () => {
  it('is false while the renderer handle is null (pre-bootstrap)', () => {
    const state = makeState(null);
    expect(starCatalogLayer.enabled(state, CTX_STUB)).toBe(false);
  });

  it('follows the master gate, the per-item toggle, and the crossfade band', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]);
    const insideCtx = makeCtx(camAtPc(inner + (outer - inner) * 0.25));
    expect(starCatalogLayer.enabled(makeState(renderer), insideCtx)).toBe(true);

    const beyondCtx = makeCtx(camAtPc(outer + 1000));
    expect(starCatalogLayer.enabled(makeState(renderer), beyondCtx)).toBe(false);

    expect(starCatalogLayer.enabled(makeState(renderer, { master: false }), insideCtx)).toBe(false);
    expect(starCatalogLayer.enabled(makeState(renderer, { item: false }), insideCtx)).toBe(false);
  });
});

describe('starCatalogLayer.draw', () => {
  it('draws the LEAF stream, handing every source the SAME rebased vp', () => {
    // Two loaded catalogs (same source) exercise the shared-buffer invariant:
    // the rebased vp must be computed once and passed identically to each draw.
    const loaded = [
      { source: Source.GaiaStars, catalog: makeCatalog() },
      { source: Source.GaiaStars, catalog: makeCatalog() },
    ];
    const renderer = makeRenderer(loaded);
    const camPos = camAtPc(inner + (outer - inner) * 0.5); // mid-band → partial opacity
    const view = makeNear0View(camPos);

    starCatalogLayer.draw(PASS_STUB, view, makeCtx(camPos), makeState(renderer));

    expect(renderer.draw).toHaveBeenCalledTimes(2);
    const call0 = renderer.draw.mock.calls[0]![1];
    const call1 = renderer.draw.mock.calls[1]![1];

    // Every leaf draw is tagged 'leaf' and carries only leaf nodes (isAggregate 0).
    // The flat arrays are reused grow-only buffers, so scan only `[0, drawCount)`.
    expect(call0.stream).toBe('leaf');
    expect(call0.isAggregate.subarray(0, call0.drawCount).every((v) => v === 0)).toBe(true);

    // Same rebased-vp REFERENCE to both draws, and it is the f32 narrow of the
    // f64 rebase off the slab vp — not the raw pre-narrowed view.vp.
    const expectedVp = narrowMat4(rebaseViewProj(view.slab.vp, camPos));
    expect(call0.vp).toBe(call1.vp);
    expect(call0.vp).not.toBe(view.vp);
    expect(call0.vp).toEqual(expectedVp);

    // Per-node opacity is parallel to the flat cut; the single-leaf fixture's one
    // node snaps to full on its first frame, so opacity is the pure crossfade.
    const camDistPc = Math.hypot(...camPos) / SCALE_UNITS.PC_TO_MPC;
    const expectedOpacity = fadeBand({ fullAt: inner, goneAt: outer }, camDistPc);
    expect(call0.drawCount).toBe(1);
    expect(call0.opacity[0]).toBeCloseTo(expectedOpacity, 10);
    expect(call0.source).toBe(Source.GaiaStars);
  });

  it('forwards the live size / brightness-ramp / glow-overlap / fog-cap scalars to every leaf draw', () => {
    const loaded = [
      { source: Source.GaiaStars, catalog: makeCatalog() },
      { source: Source.GaiaStars, catalog: makeCatalog() },
    ];
    const renderer = makeRenderer(loaded);
    const distPc = 1_000; // inside the crossfade band AND the ramp's interior
    const camPos = camAtPc(distPc);
    const view = makeNear0View(camPos);

    starCatalogLayer.draw(
      PASS_STUB,
      view,
      makeCtx(camPos),
      makeState(renderer, {
        size: 6.25,
        brightness: 2.0,
        glowOverlap: 2.2,
        aggregateIntensityCap: 0.15,
      }),
    );

    const expectedBrightness = 2.0 * starExposureRamp(distPc * SCALE_UNITS.PC_TO_MPC);
    expect(renderer.draw).toHaveBeenCalledTimes(2);
    for (const call of renderer.draw.mock.calls) {
      expect(call[1].sizePx).toBe(6.25);
      expect(call[1].glowOverlap).toBe(2.2);
      expect(call[1].aggregateIntensityCap).toBe(0.15);
      expect(call[1].brightness).toBeCloseTo(expectedBrightness, 10);
    }
  });

  it('is a no-op when the renderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View(camAtPc(inner));
    const state = makeState(null);
    expect(() => starCatalogLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });
});

/**
 * VR regression: the per-node `originRelCamMpc` a VR frame's ONE walk bakes
 * (`prepareStarCut`, shared by both eyes) is rebased against the HEAD pose,
 * not either eye's own position — see `PreparedStarCut.originMpc`'s doc. A
 * draw call MUST rebase its vp against that SAME origin (`prep.originMpc`),
 * never `view.camPos` (this eye's own position): using the per-eye camPos
 * there — the bug traced on-device — reintroduces a `headPos - eyePos`
 * mismatch between the vp and the baked origins, so every star renders
 * offset by that (world-scale) vector and parallaxes wrong under head motion.
 */
describe('starCatalogLayer.draw — VR head/eye origin (on-device parallax bug)', () => {
  function makeEye(camPos: Vec3): VrEye {
    return {
      camPos,
      viewNear0: mat4d.identity() as Float64Array,
      tan: { l: -1e6, r: 1e6, d: -1e6, u: 1e6 },
    } as unknown as VrEye;
  }

  /** Same shape as `makeCtx`, plus the fields the VR frustum builder reads. */
  function makeVrCtx(camPos: Readonly<Vec3>): ReadyFrameContext {
    return {
      drawCamPos: camPos,
      nowMs: 0,
      fovYRad: 1.0,
      canvasSize: { width: 1280, height: 720 },
    } as unknown as ReadyFrameContext;
  }

  it("rebases every eye's draw against the HEAD pose, not that eye's own camPos", () => {
    const loaded = [{ source: Source.GaiaStars, catalog: makeCatalog() }];
    const renderer = makeRenderer(loaded);
    const state = makeState(renderer);

    // Two eyes straddling the band's midpoint symmetrically along z, so the
    // HEAD pose (their midpoint) sits exactly at `headDistPc` while each eye
    // individually sits noticeably off it — distinguishable from the head by
    // far more than an interocular offset, so a wrong rebase origin cannot
    // hide behind rounding.
    const headDistPc = inner + (outer - inner) * 0.5;
    const eye0 = makeEye(camAtPc(headDistPc - 200));
    const eye1 = makeEye(camAtPc(headDistPc + 200));
    vrOverride.active = true;
    vrOverride.eyes = [eye0, eye1]; // ONE array reference — both draws share the memoised walk.

    // Both eyes' SlabViews share the identical `slab.vp` on purpose: any
    // difference between the two `renderer.draw` calls' rebased `vp` can then
    // only come from the rebase ORIGIN each draw chose, isolating the bug.
    const sharedSlabVp = Float64Array.from({ length: 16 }, (_, i) => i + 0.5);
    const slab: Slab = {
      index: NEAR0,
      nearMpc: 0.0005,
      farMpc: 500,
      vp: sharedSlabVp,
      originRelative: true,
      precision: 'f64',
      reversedZ: false,
    };
    const view0: SlabView = { slab, vp: new Float32Array(16), camPos: eye0.camPos, viewportPx: [1280, 720] };
    const view1: SlabView = { slab, vp: new Float32Array(16), camPos: eye1.camPos, viewportPx: [1280, 720] };

    starCatalogLayer.draw(PASS_STUB, view0, makeVrCtx(eye0.camPos), state);
    starCatalogLayer.draw(PASS_STUB, view1, makeVrCtx(eye1.camPos), state);

    expect(renderer.draw).toHaveBeenCalledTimes(2);
    const vp0 = renderer.draw.mock.calls[0]![1].vp;
    const vp1 = renderer.draw.mock.calls[1]![1].vp;

    const headPos = camAtPc(headDistPc);
    const expectedVp = narrowMat4(rebaseViewProj(sharedSlabVp, headPos));
    // Both eyes must agree with EACH OTHER (same slab.vp + same rebase origin)…
    expect(vp0).toEqual(vp1);
    // …and that shared result must be the HEAD-pose rebase, not either eye's own.
    expect(vp0).toEqual(expectedVp);
    const wrongPerEyeVp = narrowMat4(rebaseViewProj(sharedSlabVp, eye0.camPos));
    expect(vp0).not.toEqual(wrongPerEyeVp);

    // Direct check on the traced field: the shared prep's origin is the head
    // pose, not either eye's camPos.
    const prep = prepareStarCut(state, makeVrCtx(eye0.camPos))!;
    expect(prep.originMpc).toEqual(headPos);
  });
});
