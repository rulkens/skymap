/**
 * planetsLayer — unit tests for the seeded-planets content row.
 *
 * Two load-bearing assertions:
 *
 *   1. The f64 seam — every planet's MVP composes from the slab's
 *      `Float64Array` view-projection (`view.slab.vp`), NOT the f32-narrowed
 *      `view.vp` (identity-pinned via a mocked `composeBodyMvp`).
 *   2. The single instanced draw — ONE `renderer.draw(pass, staging, n)` paints
 *      every planet, with body i's albedo packed at instance stride 20 floats
 *      (albedo at floats base+16..18). A per-draw uniform would instead race
 *      `queue.writeBuffer` against submit and render both planets at the
 *      last-written MVP; the packed instance batch is what avoids that.
 */

import { describe, it, expect, vi } from 'vitest';

import { planetsLayer } from '../../../../../src/services/engine/frame/passes/planetsLayer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCENE_PLANETS } from '../../../../../src/data/bodies/scenePlanets';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { INSTANCE_FLOATS } from '../../../../../src/services/gpu/renderers/bodies/planetRenderer';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { PlanetBody } from '../../../../../src/@types/scene/PlanetBody';

// Mock composeBodyMvp so the test can (a) assert which vp it consumed by
// object identity and (b) hand each planet a recognisable Float32Array.
// The real composition math is covered by composeBodyMvp's own tests.
vi.mock('../../../../../src/utils/camera/composeBodyMvp', () => ({
  composeBodyMvp: vi.fn<() => Float32Array>(() => new Float32Array(16)),
}));
import { composeBodyMvp } from '../../../../../src/utils/camera/composeBodyMvp';

const composeMock = composeBodyMvp as unknown as ReturnType<typeof vi.fn>;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setIndexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  drawIndexed: vi.fn(),
} as unknown as GPURenderPassEncoder;

// Bare ctx for the null-handle and draw cases: draw never reads ctx, and
// enabled's handle check must short-circuit BEFORE the ctx.cam read
// (renderFrame fixtures carry null handles and a bare ctx).
const CTX_STUB = {} as ReadyFrameContext;

// Beyond the handle checks, enabled reads ctx.cam.distance (the shared
// foreground gate) AND the camera position + projection knobs (the per-body
// sub-pixel gate — the same predicate draw's pack loop applies). The fixture
// camera parks just off Mercury's centre (the first seeded body) so, whenever
// `distance` is inside the foreground gate, at least one body resolves and
// the `distance` argument alone drives the foreground-gate assertions below.
function makeCtx(distance: number): ReadyFrameContext {
  const mercury = SCENE_PLANETS[0]!.positionMpc;
  return {
    cam: { distance },
    drawCamPos: [mercury[0] + 1e-14, mercury[1], mercury[2]],
    canvasSize: { width: 1280, height: 720 },
    fovYRad: (60 * Math.PI) / 180,
  } as unknown as ReadyFrameContext;
}

// A camera comfortably inside the shared foreground gate.
const NEAR_CTX = makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2);

/**
 * A SlabView whose f64 `slab.vp` and f32 `vp` are deliberately DIFFERENT
 * arrays, so a first-arg identity check unambiguously reveals which one the
 * layer fed to composeBodyMvp.
 *
 * The viewport is an astronomically TALL stub (1e12 px): the pack loop culls
 * bodies under SUB_PIXEL_BODY_CULL_PX apparent diameter, and the layout pins
 * below want EVERY seeded body packed — from one camera position that is
 * impossible on a real viewport (Mercury is sub-pixel from Neptune), so the
 * stub buys pixels instead of bending the scene data. The cull itself has a
 * dedicated test on a real 720-px viewport.
 */
function makeNear0View(): SlabView {
  const f64Vp = Float64Array.from({ length: 16 }, (_, i) => i + 0.5);
  const f32Vp = new Float32Array(16);
  const slab: Slab = {
    index: NEAR0,
    nearMpc: 0.0005,
    farMpc: 500,
    vp: f64Vp,
    originRelative: true,
    precision: 'f64',
  };
  return {
    slab,
    vp: f32Vp,
    camPos: [0, 0, 5],
    viewportPx: [1280, 1e12],
  };
}

// Draw ctx: camera at the origin (the Sun), 60° fov — the pack loop's
// sub-pixel cull reads ctx.drawCamPos + ctx.fovYRad (paired with the
// fixture's tall viewport above so every seeded body resolves).
const DRAW_CTX = {
  drawCamPos: [0, 0, 0],
  fovYRad: (60 * Math.PI) / 180,
} as unknown as ReadyFrameContext;

/** State with a `planetRenderer` handle set and a seeded planet list. */
function makeState(planetRenderer: unknown, planets: readonly PlanetBody[]): EngineState {
  return {
    gpu: { planetRenderer },
    data: { bodies: { planets } },
  } as unknown as EngineState;
}

function makeRendererSpy() {
  return {
    draw: vi.fn<(pass: GPURenderPassEncoder, instances: Float32Array, count: number) => void>(),
  };
}

describe('planetsLayer.enabled', () => {
  it('is false while planetRenderer is null and while no planets are seeded; true with both', () => {
    // Null handle. NOTE: deliberately no state.data and a bare ctx — the
    // handle check must short-circuit BEFORE either is touched (renderFrame
    // fixtures carry null handles and no bodies bag).
    expect(
      planetsLayer.enabled({ gpu: { planetRenderer: null } } as unknown as EngineState, CTX_STUB),
    ).toBe(false);
    // Renderer only, nothing seeded (camera inside the gate).
    expect(planetsLayer.enabled(makeState(makeRendererSpy(), []), NEAR_CTX)).toBe(false);
    // Both present, camera inside the gate.
    expect(planetsLayer.enabled(makeState(makeRendererSpy(), SCENE_PLANETS), NEAR_CTX)).toBe(true);
  });

  it('is disabled beyond the foreground gate even with planets seeded', () => {
    // At galaxy scale every planet is a deep-sub-pixel speck: the shared gate
    // turns the row off so the (foreground:0, NEAR0) step can be skipped
    // wholesale.
    const state = makeState(makeRendererSpy(), SCENE_PLANETS);
    expect(planetsLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC))).toBe(false);
    expect(planetsLayer.enabled(state, makeCtx(0.43))).toBe(false);
  });

  it('is disabled while every seeded body is sub-pixel, even inside the foreground band', () => {
    // Camera ~0.002 Mpc (~400 AU) from the Sun — comfortably inside the
    // foreground distance gate (~1e-2 Mpc) but far outside every planet's
    // orbit, so every body's apparent diameter is far under
    // SUB_PIXEL_BODY_CULL_PX. A row that would pack zero bodies must not
    // stay in the pass plan just because its own draw-loop guard makes the
    // eventual draw a no-op.
    const state = makeState(makeRendererSpy(), SCENE_PLANETS);
    const subPixelCtx = {
      cam: { distance: 0.002 },
      drawCamPos: [0, 0, 0.002],
      canvasSize: { width: 1280, height: 720 },
      fovYRad: (60 * Math.PI) / 180,
    } as unknown as ReadyFrameContext;
    expect(planetsLayer.enabled(state, subPixelCtx)).toBe(false);
  });

  it('is enabled once the camera is close enough for at least one body to resolve', () => {
    // Camera parked just off Mercury's centre (the first seeded body), still
    // inside the foreground gate: Mercury alone resolving is enough to keep
    // the row in the pass plan even though every other body stays sub-pixel
    // from here.
    const state = makeState(makeRendererSpy(), SCENE_PLANETS);
    const mercury = SCENE_PLANETS[0]!.positionMpc;
    const resolvingCtx = {
      cam: { distance: 0.002 },
      drawCamPos: [mercury[0] + 1e-14, mercury[1], mercury[2]],
      canvasSize: { width: 1280, height: 720 },
      fovYRad: (60 * Math.PI) / 180,
    } as unknown as ReadyFrameContext;
    expect(planetsLayer.enabled(state, resolvingCtx)).toBe(true);
  });
});

describe('planetsLayer.draw', () => {
  it('composes one MVP per planet from view.slab.vp and issues ONE instanced draw', () => {
    composeMock.mockClear();
    const renderer = makeRendererSpy();
    const view = makeNear0View();
    const state = makeState(renderer, SCENE_PLANETS);

    planetsLayer.draw(PASS_STUB, view, DRAW_CTX, state);

    // One MVP composed per planet, each from the f64 slab vp — NOT view.vp.
    expect(composeMock).toHaveBeenCalledTimes(SCENE_PLANETS.length);
    SCENE_PLANETS.forEach((planet, i) => {
      const call = composeMock.mock.calls[i]!;
      // The load-bearing seam: first arg is the slab's Float64Array vp.
      expect(call[0]).toBe(view.slab.vp);
      expect(call[0]).not.toBe(view.vp);
      expect(call[1]).toBe(planet.positionMpc);
      expect(call[2]).toBe(RENDER_ORIGIN_MPC);
      expect(call[3]).toBe(planet.radiusKm * SCALE_UNITS.KM_TO_MPC);
    });

    // Exactly one draw for the whole batch, with count == planet count.
    expect(renderer.draw).toHaveBeenCalledTimes(1);
    const [passArg, staging, count] = renderer.draw.mock.calls[0]!;
    expect(passArg).toBe(PASS_STUB);
    expect(count).toBe(SCENE_PLANETS.length);
    expect(staging).toBeInstanceOf(Float32Array);

    // The staging layout: each planet's albedo sits at floats base+16..18 of
    // its 20-float record. Planet 1 (Jupiter) → base 20 → albedo at 36..38.
    SCENE_PLANETS.forEach((planet, i) => {
      const base = i * INSTANCE_FLOATS;
      expect(base).toBe(i * 20);
      expect(staging[base + 16]).toBeCloseTo(planet.albedo[0]);
      expect(staging[base + 17]).toBeCloseTo(planet.albedo[1]);
      expect(staging[base + 18]).toBeCloseTo(planet.albedo[2]);
      expect(staging[base + 19]).toBe(0); // trailing pad stays zeroed
    });
    // Spelled out for the second planet so the 36..38 offset is explicit.
    expect(staging[36]).toBeCloseTo(SCENE_PLANETS[1]!.albedo[0]);
    expect(staging[37]).toBeCloseTo(SCENE_PLANETS[1]!.albedo[1]);
    expect(staging[38]).toBeCloseTo(SCENE_PLANETS[1]!.albedo[2]);
  });

  it('packs only the bodies that resolve past the sub-pixel cull', () => {
    // Real 720-px viewport, camera parked 1e-14 Mpc (~300,000 km — outside
    // even Jupiter) from the FIRST seeded body: that body subtends whole
    // pixels (the smallest seeded planet, Mercury, is ~10 px there) while
    // every other body (≥ tenths of an AU away, at most planet-sized) is
    // deep sub-pixel — so exactly one record is packed and the instanced
    // draw gets count 1. Fails if the cull is dropped (count == all bodies)
    // or applied to the wrong body.
    composeMock.mockClear();
    const renderer = makeRendererSpy();
    const view: SlabView = { ...makeNear0View(), viewportPx: [1280, 720] };
    const state = makeState(renderer, SCENE_PLANETS);
    const nearFirst = SCENE_PLANETS[0]!.positionMpc;
    const ctx = {
      drawCamPos: [nearFirst[0] + 1e-14, nearFirst[1], nearFirst[2]],
      fovYRad: (60 * Math.PI) / 180,
    } as unknown as ReadyFrameContext;

    planetsLayer.draw(PASS_STUB, view, ctx, state);

    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(composeMock.mock.calls[0]![1]).toBe(SCENE_PLANETS[0]!.positionMpc);
    expect(renderer.draw).toHaveBeenCalledTimes(1);
    expect(renderer.draw.mock.calls[0]![2]).toBe(1);
  });

  it('issues no draw when every body is sub-pixel', () => {
    // Camera 1e-3 Mpc from the origin on a real viewport: every AU-scale
    // body is far under a pixel, so nothing packs and the layer must not
    // call the renderer at all (an n=0 instanced draw is dead GPU work).
    const renderer = makeRendererSpy();
    const view: SlabView = { ...makeNear0View(), viewportPx: [1280, 720] };
    const state = makeState(renderer, SCENE_PLANETS);
    const ctx = {
      drawCamPos: [0, 0, 1e-3],
      fovYRad: (60 * Math.PI) / 180,
    } as unknown as ReadyFrameContext;

    planetsLayer.draw(PASS_STUB, view, ctx, state);

    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('is a no-op when the planetRenderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View();
    const state = { gpu: { planetRenderer: null } } as unknown as EngineState;
    expect(() => planetsLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });
});
