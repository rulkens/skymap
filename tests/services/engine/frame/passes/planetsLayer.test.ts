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
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { INSTANCE_FLOATS } from '../../../../../src/services/gpu/renderers/bodies/planetRenderer';
import { minPickRadiusMpc } from '../../../../../src/services/engine/helpers/minPickRadiusMpc';
import { sunDirLocal } from '../../../../../src/utils/camera/sunDirLocal';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { PlanetBody } from '../../../../../src/@types/scene/PlanetBody';
import type { BodyState } from '../../../../../src/@types/scene/BodyState';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

// Mock composeBodyMvp so the test can (a) assert which vp it consumed by
// object identity and (b) hand each planet a recognisable Float32Array.
// The real composition math is covered by composeBodyMvp's own tests.
vi.mock('../../../../../src/utils/camera/composeBodyMvp', () => ({
  composeBodyMvp: vi.fn<() => Float32Array>(() => new Float32Array(16)),
}));
import { composeBodyMvp } from '../../../../../src/utils/camera/composeBodyMvp';

// The layer reads each body's live position/orientation from the per-frame
// body-state snapshot (keyed by id). Stub it to a map built from the SeededPlanet
// fixtures, REUSING each fixture's own positionMpc/orientation refs — so the layer
// sees the exact fixture values (identity-equal), keeping the `toBe(...)`
// assertions below intact while the reads move off the baked record fields.
vi.mock('../../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn((state: EngineState): ReadonlyMap<string, BodyState> => {
    const m = new Map<string, BodyState>();
    for (const b of (state.data.bodies.planets ?? []) as readonly SeededPlanet[]) {
      m.set(b.id, { positionMpc: b.positionMpc, orientation: b.orientation, meanAnomalyRad: 0 });
    }
    const earth = state.data.bodies.earth as SeededPlanet | null;
    if (earth)
      m.set(earth.id, {
        positionMpc: earth.positionMpc,
        orientation: earth.orientation,
        meanAnomalyRad: 0,
      });
    return m;
  }),
}));

const composeMock = composeBodyMvp as unknown as ReturnType<typeof vi.fn>;

// A test fixture pairing the identity record with the J2000 state the snapshot
// carries — position + orientation were lifted off the record onto the derive, so
// the fixture supplies them here (keyed by id, refs reused by the mock above).
type SeededPlanet = PlanetBody & Pick<BodyState, 'positionMpc' | 'orientation'>;
const PLANET_STATES = deriveBodyStates(CONST_J2000);
// The real seeded roster, each identity record paired with its derived J2000
// state — so the layout/cull pins below run against the true positions.
const SEEDED_PLANETS: readonly SeededPlanet[] = SCENE_PLANETS.map((p) => ({
  ...p,
  positionMpc: PLANET_STATES.get(p.id)!.positionMpc,
  orientation: PLANET_STATES.get(p.id)!.orientation,
}));

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
  const mercury = SEEDED_PLANETS[0]!.positionMpc;
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
    reversedZ: false,
  };
  return {
    slab,
    vp: f32Vp,
    camPos: [0, 0, 5],
    viewportPx: [1280, 1e12],
  };
}

// Draw ctx: camera at the origin (the Sun), 60° fov — the partition (shared by
// enabled + draw) reads ctx.drawCamPos + ctx.canvasSize.height + ctx.fovYRad.
// An astronomically TALL viewport (1e12 px) buys pixels so every seeded body
// resolves past the glint threshold and lands in the `flat` branch — the layout
// pins below want EVERY seeded body packed from one impossible-on-a-real-viewport
// camera position (Mercury is sub-pixel from Neptune). The cull itself has a
// dedicated test on a real 720-px viewport.
const DRAW_CTX = {
  drawCamPos: [0, 0, 0],
  canvasSize: { width: 1280, height: 1e12 },
  fovYRad: (60 * Math.PI) / 180,
} as unknown as ReadyFrameContext;

/**
 * State with a `planetRenderer` handle and a seeded planet list, and NO
 * `texturedBodyRenderer` handle — `sceneBodyPartition`'s `?? false` then
 * treats every body as not-resident, so the partition routes every resolved
 * body to the `flat` branch this layer draws (a resident body would slide to
 * `textured`, drawn by `texturedBodiesLayer` instead).
 */
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
    expect(planetsLayer.enabled(makeState(makeRendererSpy(), SEEDED_PLANETS), NEAR_CTX)).toBe(true);
  });

  it('is disabled beyond the foreground gate even with planets seeded', () => {
    // At galaxy scale every planet is a deep-sub-pixel speck: the shared gate
    // turns the row off so the (foreground:0, NEAR0) step can be skipped
    // wholesale.
    // Gate edge + a decade beyond it (cosmic scale), both derived from the gate
    // so a farther seed growing FOREGROUND_MAX_DISTANCE_MPC carries this check.
    const state = makeState(makeRendererSpy(), SEEDED_PLANETS);
    expect(planetsLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC))).toBe(false);
    expect(planetsLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC * 10))).toBe(false);
  });

  it('is disabled while every seeded body is sub-pixel, even inside the foreground band', () => {
    // Camera ~0.002 Mpc (~400 AU) from the Sun — comfortably inside the
    // foreground distance gate (~1e-2 Mpc) but far outside every planet's
    // orbit, so every body's apparent diameter is far under
    // SUB_PIXEL_BODY_CULL_PX. A row that would pack zero bodies must not
    // stay in the pass plan just because its own draw-loop guard makes the
    // eventual draw a no-op.
    const state = makeState(makeRendererSpy(), SEEDED_PLANETS);
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
    const state = makeState(makeRendererSpy(), SEEDED_PLANETS);
    const mercury = SEEDED_PLANETS[0]!.positionMpc;
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
    const state = makeState(renderer, SEEDED_PLANETS);

    planetsLayer.draw(PASS_STUB, view, DRAW_CTX, state);

    // One MVP composed per planet, each from the f64 slab vp — NOT view.vp.
    expect(composeMock).toHaveBeenCalledTimes(SEEDED_PLANETS.length);
    SEEDED_PLANETS.forEach((planet, i) => {
      const call = composeMock.mock.calls[i]!;
      // The load-bearing seam: first arg is the slab's Float64Array vp.
      expect(call[0]).toBe(view.slab.vp);
      expect(call[0]).not.toBe(view.vp);
      expect(call[1]).toBe(planet.positionMpc);
      expect(call[2]).toBe(RENDER_ORIGIN_MPC);
      expect(call[3]).toBe(planet.radiusKm * SCALE_UNITS.KM_TO_MPC);
      // Each planet forwards its own baked orientation as the rotation factor.
      expect(call[4]).toBe(planet.orientation);
    });

    // Exactly one draw for the whole batch, with count == planet count.
    expect(renderer.draw).toHaveBeenCalledTimes(1);
    const [passArg, staging, count] = renderer.draw.mock.calls[0]!;
    expect(passArg).toBe(PASS_STUB);
    expect(count).toBe(SEEDED_PLANETS.length);
    expect(staging).toBeInstanceOf(Float32Array);

    // The staging layout: each planet's albedo sits at floats base+16..18 of
    // its 24-float record. Planet 1 (Jupiter) → base 24 → albedo at 40..42.
    SEEDED_PLANETS.forEach((planet, i) => {
      const base = i * INSTANCE_FLOATS;
      expect(base).toBe(i * 24);
      expect(staging[base + 16]).toBeCloseTo(planet.albedo[0]);
      expect(staging[base + 17]).toBeCloseTo(planet.albedo[1]);
      expect(staging[base + 18]).toBeCloseTo(planet.albedo[2]);
      expect(staging[base + 19]).toBe(0); // albedo pad stays zeroed
    });
    // Spelled out for the second planet so the 40..42 offset is explicit.
    expect(staging[40]).toBeCloseTo(SEEDED_PLANETS[1]!.albedo[0]);
    expect(staging[41]).toBeCloseTo(SEEDED_PLANETS[1]!.albedo[1]);
    expect(staging[42]).toBeCloseTo(SEEDED_PLANETS[1]!.albedo[2]);
  });

  it('packs each body`s sunDirLocal at floats base+20..22 with a zeroed pad', () => {
    // The per-instance sun direction that replaced the shader`s fixed LIGHT_DIR:
    // floats 20..22 carry sunDirLocal(pos, RENDER_ORIGIN_MPC, orientation) —
    // computed independently here — and float 23 the trailing pad. sunDirLocal
    // is NOT mocked, so the layer runs the real transpose-rotate.
    composeMock.mockClear();
    const renderer = makeRendererSpy();
    const view = makeNear0View();
    const state = makeState(renderer, SEEDED_PLANETS);

    planetsLayer.draw(PASS_STUB, view, DRAW_CTX, state);

    const [, staging] = renderer.draw.mock.calls[0]!;
    SEEDED_PLANETS.forEach((planet, i) => {
      const base = i * INSTANCE_FLOATS;
      const sun = sunDirLocal(planet.positionMpc, RENDER_ORIGIN_MPC, planet.orientation);
      expect(staging[base + 20]).toBeCloseTo(sun[0]);
      expect(staging[base + 21]).toBeCloseTo(sun[1]);
      expect(staging[base + 22]).toBeCloseTo(sun[2]);
      expect(staging[base + 23]).toBe(0); // sunDir pad stays zeroed
    });
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
    const state = makeState(renderer, SEEDED_PLANETS);
    const nearFirst = SEEDED_PLANETS[0]!.positionMpc;
    const ctx = {
      drawCamPos: [nearFirst[0] + 1e-14, nearFirst[1], nearFirst[2]],
      canvasSize: { width: 1280, height: 720 },
      fovYRad: (60 * Math.PI) / 180,
    } as unknown as ReadyFrameContext;

    planetsLayer.draw(PASS_STUB, view, ctx, state);

    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(composeMock.mock.calls[0]![1]).toBe(SEEDED_PLANETS[0]!.positionMpc);
    expect(renderer.draw).toHaveBeenCalledTimes(1);
    expect(renderer.draw.mock.calls[0]![2]).toBe(1);
  });

  it('issues no draw when every body is sub-pixel', () => {
    // Camera 1e-3 Mpc from the origin on a real viewport: every AU-scale
    // body is far under a pixel, so nothing packs and the layer must not
    // call the renderer at all (an n=0 instanced draw is dead GPU work).
    const renderer = makeRendererSpy();
    const view: SlabView = { ...makeNear0View(), viewportPx: [1280, 720] };
    const state = makeState(renderer, SEEDED_PLANETS);
    const ctx = {
      drawCamPos: [0, 0, 1e-3],
      canvasSize: { width: 1280, height: 720 },
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

  it('pick and draw agree on the planet count — no body is picked without being drawn', () => {
    // Regression coverage for the "draw caps, pick does not" asymmetry the
    // backlog item named: `draw` used to clamp its instanced batch to
    // MAX_PLANETS while `drawPick` walked the SAME partition uncapped, so a
    // roster past the cap left the tail bodies invisible yet still
    // clickable — an InfoCard for a body nothing drew. Neither path carries
    // a cap anymore, so the two counts — one instanced draw's `count` and
    // the number of per-body `drawSphere` pick stamps — must agree for the
    // WHOLE roster, not just whatever happened to fit under the old ceiling.
    // Deliberately asserted with no literal count on either side: the moment
    // the seeded table crosses the retired MAX_PLANETS = 24 (the S-star
    // feature brings it there), this stops being a same-answer-either-way
    // check and starts actually exercising the divergence the old clamp
    // caused.
    composeMock.mockClear();
    const view = makeNear0View();

    const renderer = makeRendererSpy();
    planetsLayer.draw(PASS_STUB, view, DRAW_CTX, makeState(renderer, SEEDED_PLANETS));
    expect(renderer.draw).toHaveBeenCalledTimes(1);
    const drawnCount = renderer.draw.mock.calls[0]![2];

    const drawSphere = vi.fn();
    const pickCtx = { ...DRAW_CTX, drawPxPerRad: 1e9 } as unknown as ReadyFrameContext;
    const pickState = {
      gpu: { bodyPickRenderer: { drawSphere } },
      data: { bodies: { planets: SEEDED_PLANETS } },
    } as unknown as EngineState;
    planetsLayer.drawPick!(PASS_STUB, view, pickCtx, pickState);
    expect(drawSphere).toHaveBeenCalledTimes(drawnCount);
  });
});

describe('planetsLayer.pickEnabled (Bug A — textured-only frame stays pickable)', () => {
  // A resolved body whose texture IS resident routes to the partition's `textured`
  // branch, NOT `flat` — so `enabled` (flat-only) is false, but the layer is the
  // SOLE pick site for flat ∪ textured (texturedBodiesLayer carries no pick
  // aspect). Camera 1e-14 Mpc off a 6371 km body → tens of px → resolved; a
  // resident bodyTextures slot → textured. This is the lone-textured-Saturn case:
  // before untextured moons resolve into `flat`, the whole planet source would be
  // unpickable if the pick pass filtered on `enabled`.
  const texturedBody: SeededPlanet = {
    id: 'mars', // a real registry id → bodyTextureSpec('mars') !== null
    label: 'Mars',
    positionMpc: [0, 0, 0],
    radiusKm: 6371,
    albedo: [0.6, 0.32, 0.23],
    orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1] as SeededPlanet['orientation'],
  };
  const texturedCtx = {
    cam: { distance: 1e-14 },
    drawCamPos: [1e-14, 0, 0],
    canvasSize: { width: 1280, height: 720 },
    fovYRad: Math.PI / 3,
    drawPxPerRad: 720 / (2 * Math.tan(Math.PI / 6)),
  } as unknown as ReadyFrameContext;
  function texturedState(): EngineState {
    return {
      gpu: {
        planetRenderer: makeRendererSpy(),
        bodyPickRenderer: { drawSphere: vi.fn() },
        // hasMap('mars', 'surface') resident → the partition routes it to
        // `textured`, not `flat`.
        texturedBodyRenderer: {
          hasMap: (id: string, kind: string) => id === 'mars' && kind === 'surface',
        },
      },
      data: { bodies: { planets: [texturedBody] } },
    } as unknown as EngineState;
  }

  it('is true while enabled is false — the flat branch is empty but textured is not', () => {
    const state = texturedState();
    // enabled mirrors the VISUAL draw's flat-only branch → false (nothing flat).
    expect(planetsLayer.enabled(state, texturedCtx)).toBe(false);
    // pickEnabled admits the row because the textured branch is non-empty.
    expect(planetsLayer.pickEnabled!(state, texturedCtx)).toBe(true);
  });

  it('is false beyond the foreground gate even with a textured body', () => {
    const state = texturedState();
    const farCtx = {
      ...texturedCtx,
      cam: { distance: FOREGROUND_MAX_DISTANCE_MPC },
    } as ReadyFrameContext;
    expect(planetsLayer.pickEnabled!(state, farCtx)).toBe(false);
  });

  it('drawPick stamps the textured body as a sphere (the sole pick site for flat ∪ textured)', () => {
    const state = texturedState();
    const view: SlabView = { ...makeNear0View(), camPos: [1e-14, 0, 0] };
    planetsLayer.drawPick!(PASS_STUB, view, texturedCtx, state);
    const drawSphere = (
      state.gpu.bodyPickRenderer as unknown as { drawSphere: ReturnType<typeof vi.fn> }
    ).drawSphere;
    expect(drawSphere).toHaveBeenCalledTimes(1);
  });
});

describe('planetsLayer.drawPick', () => {
  it('floors the pick-pass sphere radius to the shared min footprint for a small resolved body', () => {
    // A resolved-but-small planet (just past the 3 px glint threshold, so it lands
    // in `flat`) can be only a handful of pixels across — too small to click. The
    // pick-pass sphere radius must inflate to the shared 9 px-radius floor
    // (`minPickRadiusMpc`), NOT stay the true physical radius, while the VISUAL
    // draw keeps the true radius. Since composeBodyMvp is mocked, we read the
    // radius arg (index 3) the layer handed it and pin it to the inflated value.
    composeMock.mockClear();
    const KM = SCALE_UNITS.KM_TO_MPC;
    const radiusMpc = 6371 * KM;
    const pxPerRad = 720 / (2 * Math.tan(Math.PI / 6));
    // Distance chosen (small-angle) so the body subtends ~8 px — above the 3 px
    // glint threshold (→ `flat`), under the 18 px pick floor (→ inflated).
    const dist = (2 * radiusMpc * pxPerRad) / 8;

    // A real SCENE_PLANETS id ('mercury' → seed 0) so seedIndexOfBody resolves;
    // custom radius/position put it in the small-resolved regime.
    const body: SeededPlanet = {
      id: 'mercury',
      label: 'Mercury',
      positionMpc: [0, 0, 0],
      radiusKm: 6371,
      albedo: [0.3, 0.3, 0.3],
      orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1] as SeededPlanet['orientation'],
    };
    const camPos: Vec3 = [dist, 0, 0];
    const view: SlabView = { ...makeNear0View(), camPos };
    const ctx = {
      cam: { distance: dist },
      drawCamPos: camPos,
      canvasSize: { width: 1280, height: 720 },
      fovYRad: Math.PI / 3,
      drawPxPerRad: pxPerRad,
    } as unknown as ReadyFrameContext;
    const state = {
      gpu: { bodyPickRenderer: { drawSphere: vi.fn() } },
      data: { bodies: { planets: [body] } },
    } as unknown as EngineState;

    planetsLayer.drawPick!(PASS_STUB, view, ctx, state);

    // The body resolved to `flat` and was composed exactly once.
    expect(composeMock).toHaveBeenCalledTimes(1);
    const radiusArg = composeMock.mock.calls[0]![3] as number;
    const expected = minPickRadiusMpc(radiusMpc, dist, pxPerRad);
    expect(radiusArg).toBeCloseTo(expected, 30);
    // The floor is genuinely active here — the pick radius exceeds the true radius.
    expect(radiusArg).toBeGreaterThan(radiusMpc);
  });
});
