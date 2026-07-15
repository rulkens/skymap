/**
 * starCatalogLayer — unit tests for the survey (Gaia bin) star content row.
 *
 * Two behaviours are load-bearing and asserted here:
 *
 *   1. The `enabled` gate follows the toggles AND the recede-direction
 *      crossfade band. The band IS the far gate (there is no
 *      FOREGROUND_MAX_DISTANCE_MPC cut — the bubble extends well past the
 *      ≤25 pc scene stars): full inside `crossfadePc.inner`, gone past
 *      `crossfadePc.outer`, where the procedural Milky-Way cloud takes over.
 *      A camera past `outer` (or the master gate off, or the per-item toggle
 *      off, or a null renderer) closes the gate — opacity 0 ⇒ no render work
 *      (house rule: gate at `enabled`, not inside `draw`).
 *
 *   2. `draw` computes the rebased view-projection ONCE per frame and hands
 *      the IDENTICAL matrix to every source's `renderer.draw`. The renderer's
 *      camera uniform is one shared buffer rewritten on every draw call, safe
 *      only because every source in a frame receives the same rebased vp — the
 *      test yields two loaded catalogs and asserts both draws got the same
 *      matrix reference (never a per-source rebase).
 */

import { describe, it, expect, vi } from 'vitest';

import { starCatalogLayer } from '../../../../../src/services/engine/frame/passes/starCatalogLayer';
import { rebaseViewProj } from '../../../../../src/utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../../src/utils/math/narrowMat4';
import { fadeBand } from '../../../../../src/utils/math/fadeBand';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { Source } from '../../../../../src/data/source';
import { GAIA_STARS_ENTRY } from '../../../../../src/data/sources/gaia-stars';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { StarCatalog } from '../../../../../src/@types/data/starCatalog/StarCatalog';
import type { StarCatalogDrawArgs } from '../../../../../src/@types/rendering/StarCatalogRenderer';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const MPC_TO_PC = 1 / SCALE_UNITS.PC_TO_MPC;

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

function makeCtx(camPos: Readonly<Vec3>): ReadyFrameContext {
  return { drawCamPos: camPos } as unknown as ReadyFrameContext;
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
  opts: { master?: boolean; item?: boolean } = {},
): EngineState {
  const { master = true, item = true } = opts;
  return {
    gpu: { starCatalogRenderer: renderer },
    settings: {
      starCatalogs: { enabled: master, items: { gaiaStars: { enabled: item, labelEnabled: false } } },
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
  };
  return { slab, vp: new Float32Array(16), camPos, viewportPx: [1280, 720] };
}

const { inner, outer } = GAIA_STARS_ENTRY.crossfadePc;

describe('starCatalogLayer.enabled', () => {
  it('is false while the renderer handle is null (pre-bootstrap)', () => {
    const state = makeState(null);
    expect(starCatalogLayer.enabled(state, CTX_STUB)).toBe(false);
  });

  it('follows the master gate, the per-item toggle, and the crossfade band', () => {
    const renderer = makeRenderer([{ source: Source.GaiaStars, catalog: makeCatalog() }]);
    // Inside the band (a hair past inner, still well before outer) → opacity > 0.
    const insideCtx = makeCtx(camAtPc(inner + (outer - inner) * 0.25));
    expect(starCatalogLayer.enabled(makeState(renderer), insideCtx)).toBe(true);

    // Past outer → the recede band has faded to zero → the far gate closes.
    const beyondCtx = makeCtx(camAtPc(outer + 1000));
    expect(starCatalogLayer.enabled(makeState(renderer), beyondCtx)).toBe(false);

    // Master gate off, per-item toggle off → false even inside the band.
    expect(starCatalogLayer.enabled(makeState(renderer, { master: false }), insideCtx)).toBe(false);
    expect(starCatalogLayer.enabled(makeState(renderer, { item: false }), insideCtx)).toBe(false);
  });
});

describe('starCatalogLayer.draw', () => {
  it('hands every loaded catalog the SAME rebased vp and its crossfade opacity', () => {
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
    const [firstArgs] = renderer.draw.mock.calls[0]! as [GPURenderPassEncoder, StarCatalogDrawArgs];
    const call0 = renderer.draw.mock.calls[0]![1];
    const call1 = renderer.draw.mock.calls[1]![1];

    // Same rebased-vp REFERENCE to both draws (computed once per frame), and
    // it is the f32 narrow of the f64 rebase off the slab vp — not the raw
    // pre-narrowed view.vp.
    const expectedVp = narrowMat4(rebaseViewProj(view.slab.vp, camPos));
    expect(call0.vp).toBe(call1.vp);
    expect(call0.vp).not.toBe(view.vp);
    expect(call0.vp).toEqual(expectedVp);

    // Opacity is this source's recede-direction crossfade at the camera's
    // heliocentric parsec distance — partial mid-band (0 < opacity < 1).
    const camDistPc = Math.hypot(...camPos) * MPC_TO_PC;
    const expectedOpacity = fadeBand({ fullAt: inner, goneAt: outer }, camDistPc);
    expect(call0.opacity).toBeCloseTo(expectedOpacity, 10);
    expect(expectedOpacity).toBeGreaterThan(0);
    expect(expectedOpacity).toBeLessThan(1);

    // The walked cut and its parallel per-node arrays are non-empty + aligned.
    expect(firstArgs).toBe(PASS_STUB);
    expect(call0.source).toBe(Source.GaiaStars);
    expect(call0.nodeDraws.length).toBe(1);
    expect(call0.originRelCamMpc.length).toBe(call0.nodeDraws.length);
    expect(call0.cellScaleMpc.length).toBe(call0.nodeDraws.length);
  });

  it('is a no-op when the renderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View(camAtPc(inner));
    const state = makeState(null);
    expect(() => starCatalogLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });
});
