/**
 * ringsLayer — unit tests for the translucent planetary-ring row, one
 * `'body'`-slab content row per host body.
 *
 * Load-bearing assertions:
 *
 *   1. The row profile: `slab: 'body'`, `(foreground:0)`, blend 'over'.
 *   2. The gate: a row draws only when `SCENE_RINGS` has an entry for THIS
 *      row's `bodyId` AND that ring's strip is resident — the required
 *      "ringsLayer draws only for a body with a ring row" case: an earth row
 *      and a saturn row, exactly one draw, on saturn.
 *   3. The f64 seam: the ring MVP composes from the slab's `Float64Array`
 *      view-projection (`view.slab.vp`), NOT the f32-narrowed `view.vp`,
 *      scaled to the ring's OUTER radius, with the pose off `ctx.bodyPose`.
 *   4. The two-radius asymmetry: `bodySlabCamLocal` is measured at the
 *      PLANET's radius, NOT the ring's outer radius — inherited unchanged
 *      from the pre-body-slabs layer (see the layer's module header).
 */

import { describe, it, expect, vi } from 'vitest';

import { ringsLayer } from '../../../../../src/services/engine/frame/passes/ringsLayer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { SCENE_RINGS } from '../../../../../src/data/bodies/sceneRings';
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
// own test files. This suite pins the ARGUMENTS the layer feeds them.
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

type SeededPlanet = PlanetBody & Pick<BodyState, 'positionMpc' | 'orientation'>;
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

const mvpMock = composeBodySlabMvp as unknown as ReturnType<typeof vi.fn>;
const camLocalMock = bodySlabCamLocal as unknown as ReturnType<typeof vi.fn>;

const IDENTITY_MAT3 = [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as BodyState['orientation'];

const SATURN_RING = SCENE_RINGS.find((r) => r.textureId === 'saturn-ring')!;

/** Saturn sitting down +x, firmly resolved on the fixture viewport. */
function saturnBody(): SeededPlanet {
  const radiusM = 58_232_000;
  const distanceM = radiusM * 5;
  return {
    id: SATURN_RING.bodyId,
    label: 'Saturn',
    positionMpc: [distanceM * SCALE_UNITS.M_TO_MPC, 0, 0],
    radiusM,
    albedo: [0.8, 0.7, 0.5],
    orientation: IDENTITY_MAT3,
  };
}

/** A ringless body, e.g. Earth, for the "no ring row" branch of the gate. */
function earthBody(): SeededPlanet {
  return {
    id: 'earth',
    label: 'Earth',
    positionMpc: [1, 0, 0],
    radiusM: 6371000,
    albedo: [0.3, 0.4, 0.6],
    orientation: IDENTITY_MAT3,
  };
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

function makeCtx(distance = FOREGROUND_MAX_DISTANCE_MPC / 2): ReadyFrameContext {
  return {
    cam: { distance },
    drawCamPos: [0, 0, 0],
    bodyPose: (() => STUB_POSE) as ReadyFrameContext['bodyPose'],
    canvasSize: { width: 1280, height: 720 },
    fovYRad: Math.PI / 3,
  } as unknown as ReadyFrameContext;
}

function makeBodyView(bodyId: BodyId): SlabView {
  const f64Vp = Float64Array.from({ length: 16 }, (_, i) => i + 0.5);
  const f32Vp = new Float32Array(16);
  const slab: Slab = makeSlab({ vp: f64Vp, frame: { kind: 'body-m', bodyId } });
  return { slab, vp: f32Vp, camPos: [0, 0, 5], viewportPx: [1280, 720] };
}

/**
 * State with a `ringRenderer` handle, a seeded body list, and a `bodyTextures`
 * slot Map reporting the given ids resident (`current()` non-null).
 */
function makeState(
  renderer: unknown,
  bodies: readonly PlanetBody[],
  residentIds: readonly string[],
): EngineState {
  const bodyTextures = new Map(
    residentIds.map((id) => [`${id}:surface`, { current: () => ({}) as ImageBitmap }]),
  );
  return {
    gpu: { ringRenderer: renderer },
    data: { bodies: { planets: bodies } },
    assetSlots: { bodyTextures },
  } as unknown as EngineState;
}

function makeRendererSpy() {
  return { draw: vi.fn<(pass: GPURenderPassEncoder, uniforms: Float32Array) => void>() };
}

describe('ringsLayer row profile', () => {
  it('is a body-slab row over (foreground:0) with straight-alpha over', () => {
    expect(ringsLayer.name).toBe('rings');
    expect(ringsLayer.slab).toBe('body');
    expect(ringsLayer.target).toBe('foreground:0');
    expect(ringsLayer.blend).toBe('over');
  });
});

describe('ringsLayer.enabled', () => {
  it('is false while the ringRenderer handle is null (bare ctx short-circuits)', () => {
    const state = makeState(null, [], []);
    expect(ringsLayer.enabled(state, CTX_STUB, makeBodyView('saturn' as BodyId))).toBe(false);
  });

  it('is false beyond the foreground gate even with a resident resolved ring', () => {
    const state = makeState(makeRendererSpy(), [saturnBody()], ['saturn-ring']);
    expect(
      ringsLayer.enabled(
        state,
        makeCtx(FOREGROUND_MAX_DISTANCE_MPC),
        makeBodyView('saturn' as BodyId),
      ),
    ).toBe(false);
  });

  it('is false when the ring strip is NOT resident', () => {
    const state = makeState(makeRendererSpy(), [saturnBody()], []);
    expect(ringsLayer.enabled(state, makeCtx(), makeBodyView('saturn' as BodyId))).toBe(false);
  });

  it('draws only for a body with a ring row: false for earth, true for saturn', () => {
    const state = makeState(makeRendererSpy(), [earthBody(), saturnBody()], ['saturn-ring']);
    const ctx = makeCtx();
    expect(ringsLayer.enabled(state, ctx, makeBodyView('earth' as BodyId))).toBe(false);
    expect(ringsLayer.enabled(state, ctx, makeBodyView('saturn' as BodyId))).toBe(true);
  });

  it('is false when the view is not a body-m row', () => {
    const state = makeState(makeRendererSpy(), [saturnBody()], ['saturn-ring']);
    const worldMpcView: SlabView = {
      slab: makeSlab({ frame: { kind: 'world-mpc', originRelative: true } }),
      vp: new Float32Array(16),
      camPos: [0, 0, 0],
      viewportPx: [1, 1],
    };
    expect(ringsLayer.enabled(state, makeCtx(), worldMpcView)).toBe(false);
  });
});

describe('ringsLayer.draw', () => {
  it('draws exactly once across an earth row and a saturn row — the saturn row only', () => {
    const renderer = makeRendererSpy();
    const state = makeState(renderer, [earthBody(), saturnBody()], ['saturn-ring']);
    const ctx = makeCtx();

    ringsLayer.draw(PASS_STUB, makeBodyView('earth' as BodyId), ctx, state);
    ringsLayer.draw(PASS_STUB, makeBodyView('saturn' as BodyId), ctx, state);

    expect(renderer.draw).toHaveBeenCalledTimes(1);
  });

  it('composes the MVP from view.slab.vp (never view.vp), scaled to the ring OUTER radius, from ctx.bodyPose', () => {
    mvpMock.mockClear();
    camLocalMock.mockClear();
    const renderer = makeRendererSpy();
    const view = makeBodyView('saturn' as BodyId);
    const saturn = saturnBody();
    const state = makeState(renderer, [saturn], ['saturn-ring']);

    ringsLayer.draw(PASS_STUB, view, makeCtx(), state);

    expect(mvpMock).toHaveBeenCalledTimes(1);
    const call = mvpMock.mock.calls[0]!;
    expect(call[0]).toBe(view.slab.vp);
    expect(call[0]).not.toBe(view.vp);
    expect(call[1]).toBe(STUB_POSE.eyeRelBodyM);
    expect(call[2]).toBeCloseTo(SATURN_RING.outerRadiusKm * SCALE_UNITS.KM_TO_M);
  });

  it('measures bodySlabCamLocal at the PLANET radius, NOT the ring outer radius', () => {
    camLocalMock.mockClear();
    const renderer = makeRendererSpy();
    const saturn = saturnBody();
    const state = makeState(renderer, [saturn], ['saturn-ring']);

    ringsLayer.draw(PASS_STUB, makeBodyView('saturn' as BodyId), makeCtx(), state);

    expect(camLocalMock).toHaveBeenCalledTimes(1);
    expect(camLocalMock.mock.calls[0]![0]).toBe(STUB_POSE.eyeRelBodyM);
    // NOT the ring's outer radius — the fragment's in-front-of-planet test
    // wants "planet radii", the same frame texturedBodiesLayer's Minnaert
    // term uses.
    expect(camLocalMock.mock.calls[0]![1]).toBe(saturn.radiusM);
    expect(camLocalMock.mock.calls[0]![1]).not.toBeCloseTo(
      SATURN_RING.outerRadiusKm * SCALE_UNITS.KM_TO_M,
    );
  });

  it('packs the host sun@16..18, planetRadiusRatio@19, camPosLocal@20..22 and innerRatio@23', () => {
    const renderer = makeRendererSpy();
    const saturn = saturnBody();
    const state = makeState(renderer, [saturn], ['saturn-ring']);

    ringsLayer.draw(PASS_STUB, makeBodyView('saturn' as BodyId), makeCtx(), state);

    expect(renderer.draw).toHaveBeenCalledTimes(1);
    const [pass, u] = renderer.draw.mock.calls[0]!;
    expect(pass).toBe(PASS_STUB);
    expect(u).toBeInstanceOf(Float32Array);
    expect(u).toHaveLength(24);

    const expectedSun = sunDirLocal(saturn.positionMpc, RENDER_ORIGIN_MPC, saturn.orientation);
    expect(u[16]).toBeCloseTo(expectedSun[0]);
    expect(u[17]).toBeCloseTo(expectedSun[1]);
    expect(u[18]).toBeCloseTo(expectedSun[2]);
    expect(u[19]).toBeCloseTo((saturn.radiusM * SCALE_UNITS.M_TO_KM) / SATURN_RING.outerRadiusKm);
    // camPosLocal is mocked — pin the PACKED value to the mock's return, the
    // pairing/frame invariant is covered by the dedicated test above.
    expect(u[20]).toBe(Math.fround(MOCK_CAM_LOCAL[0]));
    expect(u[21]).toBe(Math.fround(MOCK_CAM_LOCAL[1]));
    expect(u[22]).toBe(Math.fround(MOCK_CAM_LOCAL[2]));
    expect(u[23]).toBeCloseTo(SATURN_RING.innerRadiusKm / SATURN_RING.outerRadiusKm);
  });

  it('is a no-op when the ringRenderer handle is null (pre-bootstrap)', () => {
    const view = makeBodyView('saturn' as BodyId);
    const state = makeState(null, [saturnBody()], ['saturn-ring']);
    expect(() => ringsLayer.draw(PASS_STUB, view, makeCtx(), state)).not.toThrow();
  });

  it('is a no-op when the view is not a body-m row', () => {
    const renderer = makeRendererSpy();
    const state = makeState(renderer, [saturnBody()], ['saturn-ring']);
    const worldMpcView: SlabView = {
      slab: makeSlab({ frame: { kind: 'world-mpc', originRelative: true } }),
      vp: new Float32Array(16),
      camPos: [0, 0, 0],
      viewportPx: [1, 1],
    };
    ringsLayer.draw(PASS_STUB, worldMpcView, makeCtx(), state);
    expect(renderer.draw).not.toHaveBeenCalled();
  });
});
