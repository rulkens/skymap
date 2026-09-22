/**
 * starCatalogPass — unit tests for the survey (Gaia bin) star LEAF content
 * row. The walk / fade / partition that feeds both streams lives in
 * `readStarCut` and is tested in `readStarCut.test.ts`; here we pin only
 * the layer's own behaviour:
 *
 *   1. `enabled` delegates to `starCatalogVisible` — the toggles AND the
 *      recede-direction crossfade band that IS the far gate (full inside
 *      `crossfadePc.inner`, gone past `crossfadePc.outer`). A camera past
 *      `outer`, the master gate off, or the per-item toggle off all close
 *      the gate — opacity 0 ⇒ no render work.
 *
 *   2. `draw` records the LEAF stream only, computing the rebased vp ONCE and
 *      handing the IDENTICAL matrix to every source's `renderer.draw` (the
 *      shared-camera-uniform invariant), tagged `stream: 'leaf'`, forwarding
 *      the live size / brightness / glow-overlap / fog-cap scalars.
 */

import { describe, it, expect, vi } from 'vitest';

import { starCatalogPass } from '../../../../src/layers/starCatalog/passes/starCatalogPass';
import { rebaseViewProj } from '../../../../src/utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../src/utils/math/narrowMat4';
import { fadeBand } from '../../../../src/utils/math/fadeBand';
import { starExposureRamp } from '../../../../src/utils/star/starExposureRamp';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { Source } from '../../../../src/data/source';
import { GAIA_STARS_ENTRY } from '../../../../src/layers/starCatalog/sources/gaia-stars';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';
import type { StarCatalogRuntime } from '../../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { StarCatalog } from '../../../../src/@types/data/starCatalog/StarCatalog';
import type { StarCatalogDrawArgs } from '../../../../src/@types/rendering/starCatalogRenderer/StarCatalogDrawArgs';
import type { StarCatalogSettings } from '../../../../src/@types/settings/StarCatalogSettings';
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

/**
 * A fresh ctx per call — `readStarCut` memoises on the ctx object, so a
 * distinct object per frame keeps every draw a clean recompute.
 */
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
  };
}

/** A spy renderer over the StarCatalogRenderer draw surface, wrapped as a runtime. */
function makeRuntime(loaded: readonly { source: number; catalog: StarCatalog }[]): {
  runtime: StarCatalogRuntime;
  draw: ReturnType<typeof vi.fn<(pass: GPURenderPassEncoder, args: StarCatalogDrawArgs) => void>>;
} {
  const draw = vi.fn<(pass: GPURenderPassEncoder, args: StarCatalogDrawArgs) => void>();
  const renderer = {
    upload: vi.fn(),
    loadedCatalogs: vi.fn(() => loaded[Symbol.iterator]()),
    draw,
  };
  return { runtime: { renderer } as unknown as StarCatalogRuntime, draw };
}

function makeSettings(
  opts: {
    master?: boolean;
    item?: boolean;
    size?: number;
    brightness?: number;
    refineThreshold?: number;
    glowOverlap?: number;
    aggregateIntensityCap?: number;
  } = {},
): StarCatalogSettings {
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
    enabled: master,
    sizePx: size,
    brightness,
    refineThreshold,
    glowOverlap,
    aggregateIntensityCap,
    items: { gaiaStars: { enabled: item, labelEnabled: false } },
  } as unknown as StarCatalogSettings;
}

/** The `PassState` shape `starCatalogPass` reads — settings only. */
function makePassState(settings: StarCatalogSettings): PassState {
  return { settings: { starCatalogs: settings } } as unknown as PassState;
}

/**
 * A NEAR0 SlabView whose f64 `slab.vp` and f32 `vp` are DIFFERENT arrays, so
 * an identity check reveals the layer rebases off the f64 slab vp, not the
 * pre-narrowed `view.vp`.
 */
function makeNear0View(camPos: Vec3): SlabView {
  const slab: Slab = makeSlab();
  return { slab, vp: new Float32Array(16), camPos, viewportPx: [1280, 720] };
}

const { inner, outer } = GAIA_STARS_ENTRY.crossfadePc;

// `enabled` never reads `view` — an arbitrary NEAR0 view satisfies the 3-arg
// signature for every case below.
const VIEW_STUB = makeNear0View([0, 0, 0]);

describe('starCatalogPass.enabled', () => {
  it('follows the master gate, the per-item toggle, and the crossfade band', () => {
    const { runtime } = makeRuntime([{ source: Source.GaiaStars, catalog: makeCatalog() }]);
    const pass = starCatalogPass(runtime);
    const insideCtx = makeCtx(camAtPc(inner + (outer - inner) * 0.25));
    expect(pass.enabled(makePassState(makeSettings()), insideCtx, VIEW_STUB)).toBe(true);

    const beyondCtx = makeCtx(camAtPc(outer + 1000));
    expect(pass.enabled(makePassState(makeSettings()), beyondCtx, VIEW_STUB)).toBe(false);

    expect(pass.enabled(makePassState(makeSettings({ master: false })), insideCtx, VIEW_STUB)).toBe(
      false,
    );
    expect(pass.enabled(makePassState(makeSettings({ item: false })), insideCtx, VIEW_STUB)).toBe(
      false,
    );
  });
});

describe('starCatalogPass.draw', () => {
  it('draws the LEAF stream, handing every source the SAME rebased vp', () => {
    // Two loaded catalogs (same source) exercise the shared-buffer invariant:
    // the rebased vp must be computed once and passed identically to each draw.
    const loaded = [
      { source: Source.GaiaStars, catalog: makeCatalog() },
      { source: Source.GaiaStars, catalog: makeCatalog() },
    ];
    const { runtime, draw } = makeRuntime(loaded);
    const pass = starCatalogPass(runtime);
    const camPos = camAtPc(inner + (outer - inner) * 0.5); // mid-band → partial opacity
    const view = makeNear0View(camPos);

    pass.draw!(PASS_STUB, view, makeCtx(camPos), makePassState(makeSettings()));

    expect(draw).toHaveBeenCalledTimes(2);
    const call0 = draw.mock.calls[0]![1];
    const call1 = draw.mock.calls[1]![1];

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
    const { runtime, draw } = makeRuntime(loaded);
    const pass = starCatalogPass(runtime);
    const distPc = 1_000; // inside the crossfade band AND the ramp's interior
    const camPos = camAtPc(distPc);
    const view = makeNear0View(camPos);

    pass.draw!(
      PASS_STUB,
      view,
      makeCtx(camPos),
      makePassState(
        makeSettings({
          size: 6.25,
          brightness: 2.0,
          glowOverlap: 2.2,
          aggregateIntensityCap: 0.15,
        }),
      ),
    );

    const expectedBrightness = 2.0 * starExposureRamp(distPc * SCALE_UNITS.PC_TO_MPC);
    expect(draw).toHaveBeenCalledTimes(2);
    for (const call of draw.mock.calls) {
      expect(call[1].sizePx).toBe(6.25);
      expect(call[1].glowOverlap).toBe(2.2);
      expect(call[1].aggregateIntensityCap).toBe(0.15);
      expect(call[1].pxPerRad).toBe(623.5);
      expect(call[1].brightness).toBeCloseTo(expectedBrightness, 10);
    }
  });
});
