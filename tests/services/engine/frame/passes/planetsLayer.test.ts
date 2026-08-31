/**
 * planetsLayer — unit tests for the seeded-planets `'body'`-slab content row.
 *
 * Load-bearing assertions:
 *
 *   1. The f64 seam — the MVP composes from the slab's `Float64Array`
 *      view-projection (`view.slab.vp`), NOT the f32-narrowed `view.vp`
 *      (identity-pinned via a mocked `composeBodySlabMvp`), and reads the
 *      pose off `ctx.bodyPose(bodyId)` rather than re-deriving it.
 *   2. The partition boundary, now re-exposed by N body-m rows: a row draws
 *      ONLY when its `bodyId` is in the partition's `flat` branch, and
 *      `texturedBodiesLayer` / `planetsLayer` never both draw the same body —
 *      the double-draw/z-fight bug the shared `sceneBodyPartition` exists to
 *      prevent.
 *   3. The MVP / `bodySlabCamLocal` pairing — the renderer ray-traces its
 *      silhouette from the packed camera, so it must be measured in the frame
 *      the packed MVP's model scale (`radiusM`) defines.
 */

import { describe, it, expect, vi } from 'vitest';

import { planetsLayer } from '../../../../../src/services/engine/frame/passes/planetsLayer';
import { texturedBodiesLayer } from '../../../../../src/services/engine/frame/passes/texturedBodiesLayer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { INSTANCE_FLOATS } from '../../../../../src/services/gpu/renderers/bodies/planetRenderer';
import { BODY_PICK_MIN_RADIUS_PX } from '../../../../../src/services/engine/helpers/minPickRadiusMpc';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { sunDirLocal } from '../../../../../src/utils/camera/sunDirLocal';
import { makeSlab } from '../../../../fixtures/makeSlab';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { BodyId } from '../../../../../src/@types/data/body/BodyId';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { PlanetBody } from '../../../../../src/@types/scene/PlanetBody';
import type { BodyState } from '../../../../../src/@types/scene/BodyState';
import type { BodyRelativePose } from '../../../../../src/@types/engine/camera/BodyRelativePose';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

// Mock the two body-slab compose primitives — real math is covered by their
// own test files. This suite pins the ARGUMENTS the layer feeds them, and
// lets sunDirLocal run for real so the packed sun direction reveals a
// drift in the rotate/pack.
const MOCK_MVP = new Float64Array(16);
const MOCK_CAM_LOCAL: Vec3 = [0.1, 0.2, 0.3];
vi.mock('../../../../../src/utils/camera/composeBodySlabMvp', () => ({
  composeBodySlabMvp: vi.fn<() => Float64Array>(() => MOCK_MVP),
}));
vi.mock('../../../../../src/utils/camera/bodySlabCamLocal', () => ({
  bodySlabCamLocal: vi.fn<() => Vec3>(() => MOCK_CAM_LOCAL),
}));
import { composeBodySlabMvp } from '../../../../../src/utils/camera/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../../../src/utils/camera/bodySlabCamLocal';

// Both planetsLayer and texturedBodiesLayer read each body's live
// position/orientation off this per-frame snapshot — mocked once so the
// cross-layer no-double-draw test sees consistent state through both layers.
type SeededPlanet = PlanetBody & Pick<BodyState, 'positionMpc' | 'orientation'>;
vi.mock('../../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn((state: EngineState): ReadonlyMap<string, BodyState> => {
    const m = new Map<string, BodyState>();
    for (const b of (state.data.bodies.planets ?? []) as readonly SeededPlanet[]) {
      m.set(b.id, { positionMpc: b.positionMpc, orientation: b.orientation, meanAnomalyRad: 0 });
    }
    return m;
  }),
}));

const mvpMock = composeBodySlabMvp as unknown as ReturnType<typeof vi.fn>;
const camLocalMock = bodySlabCamLocal as unknown as ReturnType<typeof vi.fn>;

const IDENTITY_MAT3 = [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as BodyState['orientation'];

/**
 * A body sitting `radiusM·5` down +x — firmly resolved (well past the 3 px
 * glint threshold) on the 720-tall/60° fixture viewport used throughout.
 */
function bodyAt(id: string, radiusM: number): SeededPlanet {
  const distanceM = radiusM * 5;
  return {
    id,
    label: id,
    radiusM,
    albedo: [0.5, 0.3, 0.2],
    positionMpc: [distanceM * SCALE_UNITS.M_TO_MPC, 0, 0],
    orientation: IDENTITY_MAT3,
  };
}

/** Deep sub-pixel from the fixture camera below — lands in the `glints` branch. */
function glintBodyAt(id: string, radiusM: number): SeededPlanet {
  return { ...bodyAt(id, radiusM), positionMpc: [radiusM * 1e7 * SCALE_UNITS.M_TO_MPC, 0, 0] };
}

const STUB_POSE: BodyRelativePose = { eyeRelBodyM: [1, 2, 3], basisM: IDENTITY_MAT3 };

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setIndexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  drawIndexed: vi.fn(),
} as unknown as GPURenderPassEncoder;

const CTX_STUB = {} as ReadyFrameContext;

/** A ctx comfortably inside the shared foreground gate, with a fixed pose for every body. */
function makeCtx(distance = FOREGROUND_MAX_DISTANCE_MPC / 2): ReadyFrameContext {
  return {
    cam: { distance },
    drawCamPos: [0, 0, 0],
    bodyPose: (() => STUB_POSE) as ReadyFrameContext['bodyPose'],
    canvasSize: { width: 1280, height: 720 },
    fovYRad: Math.PI / 3,
    drawPxPerRad: 720 / (2 * Math.tan(Math.PI / 6)),
  } as unknown as ReadyFrameContext;
}

function makeBodyView(bodyId: BodyId): SlabView {
  const f64Vp = Float64Array.from({ length: 16 }, (_, i) => i + 0.5);
  const f32Vp = new Float32Array(16);
  const slab: Slab = makeSlab({ vp: f64Vp, frame: { kind: 'body-m', bodyId } });
  return { slab, vp: f32Vp, camPos: [0, 0, 5], viewportPx: [1280, 720] };
}

function makeRendererSpy() {
  return {
    draw: vi.fn<
      (pass: GPURenderPassEncoder, bodyId: string, instances: Float32Array, count: number) => void
    >(),
  };
}

/**
 * State seeding the flat/textured/glint partition fixture: `mercury` not
 * resident (flat), `mars` resident (textured), `moon` deep sub-pixel (glint).
 */
function makePartitionFixtureState(): EngineState {
  const flat = bodyAt('mercury', 2440000);
  const textured = bodyAt('mars', 3390000);
  const glint = glintBodyAt('moon', 1737000);
  return {
    gpu: {
      planetRenderer: makeRendererSpy(),
      texturedBodyRenderer: {
        draw: vi.fn(),
        hasMap: (id: string, kind: string) => id === 'mars' && kind === 'surface',
      },
    },
    data: { bodies: { planets: [flat, textured, glint] } },
  } as unknown as EngineState;
}

describe('planetsLayer.enabled', () => {
  it('is false while planetRenderer is null (bare ctx short-circuits)', () => {
    const state = { gpu: { planetRenderer: null } } as unknown as EngineState;
    expect(planetsLayer.enabled(state, CTX_STUB, makeBodyView('mercury' as BodyId))).toBe(false);
  });

  it('is false beyond the foreground gate even for a flat body', () => {
    const state = makePartitionFixtureState();
    const farCtx = makeCtx(FOREGROUND_MAX_DISTANCE_MPC);
    expect(planetsLayer.enabled(state, farCtx, makeBodyView('mercury' as BodyId))).toBe(false);
  });

  it('is true for the flat-branch row, false for the textured and glint rows', () => {
    const state = makePartitionFixtureState();
    const ctx = makeCtx();
    expect(planetsLayer.enabled(state, ctx, makeBodyView('mercury' as BodyId))).toBe(true);
    expect(planetsLayer.enabled(state, ctx, makeBodyView('mars' as BodyId))).toBe(false);
    expect(planetsLayer.enabled(state, ctx, makeBodyView('moon' as BodyId))).toBe(false);
  });

  it('is false when the view is not a body-m row', () => {
    const state = makePartitionFixtureState();
    const worldMpcView: SlabView = {
      slab: makeSlab({ frame: { kind: 'world-mpc', originRelative: true } }),
      vp: new Float32Array(16),
      camPos: [0, 0, 0],
      viewportPx: [1, 1],
    };
    expect(planetsLayer.enabled(state, makeCtx(), worldMpcView)).toBe(false);
  });
});

describe('planetsLayer.draw — one body per row (partition boundary)', () => {
  it('draws only the flat-branch body matching this row', () => {
    const state = makePartitionFixtureState();
    const renderer = state.gpu.planetRenderer as unknown as ReturnType<typeof makeRendererSpy>;
    const ctx = makeCtx();

    planetsLayer.draw(PASS_STUB, makeBodyView('mars' as BodyId), ctx, state); // textured row
    planetsLayer.draw(PASS_STUB, makeBodyView('moon' as BodyId), ctx, state); // glint row
    expect(renderer.draw).not.toHaveBeenCalled();

    planetsLayer.draw(PASS_STUB, makeBodyView('mercury' as BodyId), ctx, state); // flat row
    expect(renderer.draw).toHaveBeenCalledTimes(1);
    expect(renderer.draw.mock.calls[0]![1]).toBe('mercury'); // this row's bodyId
    expect(renderer.draw.mock.calls[0]![3]).toBe(1); // single-instance draw
  });

  it('texturedBodiesLayer and planetsLayer never both draw the same body', () => {
    const state = makePartitionFixtureState();
    const planetsRenderer = state.gpu.planetRenderer as unknown as ReturnType<
      typeof makeRendererSpy
    >;
    const texturedRenderer = state.gpu.texturedBodyRenderer as unknown as {
      draw: ReturnType<typeof vi.fn>;
    };
    const ctx = makeCtx();

    const drawnByPlanets = new Set<string>();
    const drawnByTextured = new Set<string>();
    for (const id of ['mercury', 'mars', 'moon']) {
      const view = makeBodyView(id as BodyId);

      const beforeP = planetsRenderer.draw.mock.calls.length;
      planetsLayer.draw(PASS_STUB, view, ctx, state);
      if (planetsRenderer.draw.mock.calls.length > beforeP) drawnByPlanets.add(id);

      const beforeT = texturedRenderer.draw.mock.calls.length;
      texturedBodiesLayer.draw(PASS_STUB, view, ctx, state);
      if (texturedRenderer.draw.mock.calls.length > beforeT) drawnByTextured.add(id);
    }

    // Sanity: each layer actually drew its own branch (a vacuously-true empty
    // intersection would pass even if BOTH layers drew nothing).
    expect(drawnByPlanets).toEqual(new Set(['mercury']));
    expect(drawnByTextured).toEqual(new Set(['mars']));
    for (const id of drawnByPlanets) expect(drawnByTextured.has(id)).toBe(false);
  });

  it('is a no-op when the planetRenderer handle is null (pre-bootstrap)', () => {
    const view = makeBodyView('mercury' as BodyId);
    const state = { gpu: { planetRenderer: null } } as unknown as EngineState;
    expect(() => planetsLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });

  it('is a no-op when the view is not a body-m row', () => {
    const state = makePartitionFixtureState();
    const drawSpy = state.gpu.planetRenderer as unknown as ReturnType<typeof makeRendererSpy>;
    const worldMpcView: SlabView = {
      slab: makeSlab({ frame: { kind: 'world-mpc', originRelative: true } }),
      vp: new Float32Array(16),
      camPos: [0, 0, 0],
      viewportPx: [1, 1],
    };
    planetsLayer.draw(PASS_STUB, worldMpcView, makeCtx(), state);
    expect(drawSpy.draw).not.toHaveBeenCalled();
  });
});

describe('planetsLayer.draw — the f64 seam and packed record layout', () => {
  it('composes the MVP from view.slab.vp (never view.vp) and the pose off ctx.bodyPose', () => {
    mvpMock.mockClear();
    camLocalMock.mockClear();
    const state = makePartitionFixtureState();
    const renderer = state.gpu.planetRenderer as unknown as ReturnType<typeof makeRendererSpy>;
    const ctx = makeCtx();
    const view = makeBodyView('mercury' as BodyId);
    const mercury = (state.data.bodies.planets as SeededPlanet[])[0]!;

    planetsLayer.draw(PASS_STUB, view, ctx, state);

    expect(mvpMock).toHaveBeenCalledTimes(1);
    const call = mvpMock.mock.calls[0]!;
    expect(call[0]).toBe(view.slab.vp);
    expect(call[0]).not.toBe(view.vp);
    // Second arg is the pose's eyeRelBodyM, forwarded by reference — proof the
    // layer read ctx.bodyPose rather than re-deriving a pose of its own.
    expect(call[1]).toBe(STUB_POSE.eyeRelBodyM);
    expect(call[2]).toBe(mercury.radiusM);

    expect(camLocalMock).toHaveBeenCalledTimes(1);
    expect(camLocalMock.mock.calls[0]![0]).toBe(STUB_POSE.eyeRelBodyM);
    expect(camLocalMock.mock.calls[0]![1]).toBe(mercury.radiusM);

    expect(renderer.draw).toHaveBeenCalledTimes(1);
  });

  it('packs albedo@16..18, sunDirLocal@20..22 and camPosLocal@24..26 into a 28-float record', () => {
    const state = makePartitionFixtureState();
    const renderer = state.gpu.planetRenderer as unknown as ReturnType<typeof makeRendererSpy>;
    const ctx = makeCtx();
    const mercury = (state.data.bodies.planets as SeededPlanet[])[0]!;

    planetsLayer.draw(PASS_STUB, makeBodyView('mercury' as BodyId), ctx, state);

    const [, bodyId, staging, count] = renderer.draw.mock.calls[0]!;
    expect(bodyId).toBe('mercury');
    expect(count).toBe(1);
    expect(staging).toHaveLength(INSTANCE_FLOATS);
    expect(staging[16]).toBeCloseTo(mercury.albedo[0]);
    expect(staging[17]).toBeCloseTo(mercury.albedo[1]);
    expect(staging[18]).toBeCloseTo(mercury.albedo[2]);
    expect(staging[19]).toBe(0); // albedo pad

    const expectedSun = sunDirLocal(mercury.positionMpc, RENDER_ORIGIN_MPC, mercury.orientation);
    expect(staging[20]).toBeCloseTo(expectedSun[0]);
    expect(staging[21]).toBeCloseTo(expectedSun[1]);
    expect(staging[22]).toBeCloseTo(expectedSun[2]);
    expect(staging[23]).toBe(0); // sunDir pad

    // camPosLocal is mocked — pin the PACKED value to the mock's return, not a
    // recompute (the pairing invariant is covered separately above).
    expect(staging[24]).toBe(Math.fround(MOCK_CAM_LOCAL[0]));
    expect(staging[25]).toBe(Math.fround(MOCK_CAM_LOCAL[1]));
    expect(staging[26]).toBe(Math.fround(MOCK_CAM_LOCAL[2]));
    expect(staging[27]).toBe(0); // camPosLocal pad
  });
});

describe('planetsLayer.pickEnabled (Bug A — textured-only row stays pickable)', () => {
  it('is true for the textured row even though enabled (flat-only) is false there', () => {
    const state = makePartitionFixtureState();
    const ctx = makeCtx();
    const view = makeBodyView('mars' as BodyId);
    expect(planetsLayer.enabled(state, ctx, view)).toBe(false);
    expect(planetsLayer.pickEnabled!(state, ctx, view)).toBe(true);
  });

  it('is false for the glint row (neither flat nor textured)', () => {
    const state = makePartitionFixtureState();
    const ctx = makeCtx();
    expect(planetsLayer.pickEnabled!(state, ctx, makeBodyView('moon' as BodyId))).toBe(false);
  });

  it('is false beyond the foreground gate even for a textured row', () => {
    const state = makePartitionFixtureState();
    const farCtx = makeCtx(FOREGROUND_MAX_DISTANCE_MPC);
    expect(planetsLayer.pickEnabled!(state, farCtx, makeBodyView('mars' as BodyId))).toBe(false);
  });
});

describe('planetsLayer.drawPick', () => {
  it('stamps the flat and textured rows, never the glint row', () => {
    const flat = bodyAt('mercury', 2440000);
    const textured = bodyAt('mars', 3390000);
    const glint = glintBodyAt('moon', 1737000);
    const pickRenderer = { drawSphere: vi.fn() };
    const state = {
      gpu: {
        planetRenderer: makeRendererSpy(),
        texturedBodyRenderer: {
          hasMap: (id: string, kind: string) => id === 'mars' && kind === 'surface',
        },
        bodyPickRenderer: pickRenderer,
      },
      data: { bodies: { planets: [flat, textured, glint] } },
    } as unknown as EngineState;
    const ctx = makeCtx();

    planetsLayer.drawPick!(PASS_STUB, makeBodyView('mercury' as BodyId), ctx, state); // flat
    planetsLayer.drawPick!(PASS_STUB, makeBodyView('mars' as BodyId), ctx, state); // textured
    planetsLayer.drawPick!(PASS_STUB, makeBodyView('moon' as BodyId), ctx, state); // glint
    expect(pickRenderer.drawSphere).toHaveBeenCalledTimes(2);
  });

  it('floors the pick-pass sphere radius to the shared min footprint for a small resolved body', () => {
    // A resolved-but-small planet can be only a handful of pixels across — too
    // small to click. The pick-pass radius must inflate to the shared floor
    // (BODY_PICK_MIN_RADIUS_PX / pxPerRad · distance), NOT stay the true
    // radius, while the VISUAL draw keeps the true radius.
    mvpMock.mockClear();
    const radiusM = 2440000; // Mercury-sized
    const dM = 1e12; // far enough that the true radius floors well under BODY_PICK_MIN_RADIUS_PX
    const pxPerRad = 720 / (2 * Math.tan(Math.PI / 6));
    const pose: BodyRelativePose = { eyeRelBodyM: [dM, 0, 0], basisM: IDENTITY_MAT3 };
    const state = {
      gpu: {
        planetRenderer: makeRendererSpy(),
        bodyPickRenderer: { drawSphere: vi.fn() },
      },
      data: { bodies: { planets: [{ ...bodyAt('mercury', radiusM), positionMpc: [0, 0, 0] }] } },
    } as unknown as EngineState;
    const ctx = {
      ...makeCtx(),
      bodyPose: (() => pose) as ReadyFrameContext['bodyPose'],
      drawPxPerRad: pxPerRad,
    };

    planetsLayer.drawPick!(PASS_STUB, makeBodyView('mercury' as BodyId), ctx, state);

    expect(mvpMock).toHaveBeenCalledTimes(1);
    const radiusArg = mvpMock.mock.calls[0]![2] as number;
    const expectedFloor = (BODY_PICK_MIN_RADIUS_PX / pxPerRad) * dM;
    expect(radiusArg).toBeCloseTo(expectedFloor, 0);
    expect(radiusArg).toBeGreaterThan(radiusM); // the floor is genuinely active here
  });

  it('is a no-op when the bodyPickRenderer handle is null', () => {
    const state = makePartitionFixtureState();
    (state.gpu as { bodyPickRenderer: unknown }).bodyPickRenderer = null;
    expect(() =>
      planetsLayer.drawPick!(PASS_STUB, makeBodyView('mercury' as BodyId), makeCtx(), state),
    ).not.toThrow();
  });
});
