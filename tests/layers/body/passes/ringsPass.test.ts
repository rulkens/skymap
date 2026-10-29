/**
 * ringsPass — the translucent planetary-ring row, one `'body'`-slab row per host body. Pinned: the
 * profile (`slab: 'body'`, `(foreground:0)`, blend 'over'); the gate (draws only when `SCENE_RINGS` has
 * an entry for THIS row's `bodyId` AND its strip is resident: earth row + saturn row, one draw, on
 * saturn); the f64 seam (MVP from `view.slab.vp`, NOT `view.vp`, scaled to the ring's OUTER radius,
 * pose off `ctx.bodyPose`); and the two-radius asymmetry: `bodySlabCamLocal` is measured at the
 * PLANET's radius, not the ring's outer radius.
 */

import { describe, it, expect, vi } from 'vitest';

import { ringsPass } from '../../../../src/layers/body/passes/ringsPass';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/data/rendering/foregroundMaxDistance';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { SCENE_RINGS } from '../../../../src/data/bodies/sceneRings';
import { RENDER_ORIGIN_MPC } from '../../../../src/data/renderOrigin';
import { sunDirLocal } from '../../../../src/utils/camera/sunDirLocal';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { SceneBodyId } from '../../../../src/@types/scene/SceneBodyId';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { BodyRuntime } from '../../../../src/layers/body/@types/BodyRuntime';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import { seededBodyStates } from '../../../helpers/frame/seededBodyStates';
import { sceneBodyStates } from '../../../../src/services/engine/frame/sceneBodyStates';
import type { PlanetBody } from '../../../../src/@types/scene/PlanetBody';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { BodyRelativePose } from '../../../../src/@types/engine/camera/BodyRelativePose';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const MOCK_MVP = new Float64Array(16);
const MOCK_CAM_LOCAL: Vec3 = [0.1, 0.2, 0.3];
vi.mock('../../../../src/utils/camera/composeBodySlabMvp', () => ({
  composeBodySlabMvp: vi.fn<() => Float64Array>(() => MOCK_MVP),
}));
vi.mock('../../../../src/utils/camera/bodySlabCamLocal', () => ({
  bodySlabCamLocal: vi.fn<() => Vec3>(() => MOCK_CAM_LOCAL),
}));
import { composeBodySlabMvp } from '../../../../src/utils/camera/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../../src/utils/camera/bodySlabCamLocal';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';

type SeededPlanet = PlanetBody & Pick<BodyState, 'positionMpc' | 'orientation'>;
// Production reads the static scene tables, so `makeFixture` pins the snapshot to its bodies.
vi.mock('../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn(),
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
    id: asSceneBodyId(SATURN_RING.bodyId),
    label: 'Saturn',
    positionMpc: [distanceM * SCALE_UNITS.M_TO_MPC, 0, 0],
    resolvePx: 3,
    surface: { datumRadiusM: radiusM, reliefM: [0, 0] },
    albedo: [0.8, 0.7, 0.5],
    orientation: IDENTITY_MAT3,
  };
}

/** A ringless body, e.g. Earth, for the "no ring row" branch of the gate. */
function earthBody(): SeededPlanet {
  return {
    id: asSceneBodyId('earth'),
    label: 'Earth',
    positionMpc: [1, 0, 0],
    resolvePx: 3,
    surface: { datumRadiusM: 6371000, reliefM: [0, 0] },
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

function makeCtx(distance = FOREGROUND_MAX_DISTANCE_MPC / 2): FrameView {
  return {
    cam: { distance },
    drawCamPos: [0, 0, 0],
    bodyPose: (() => STUB_POSE) as FrameView['bodyPose'],
    canvasSize: { width: 1280, height: 720 },
  } as unknown as FrameView;
}

function makeBodyView(bodyId: SceneBodyId): SlabView {
  const f64Vp = Float64Array.from({ length: 16 }, (_, i) => i + 0.5);
  const f32Vp = new Float32Array(16);
  const slab: Slab = makeSlab({ vp: f64Vp, frame: { kind: 'body-m', hostId: bodyId } });
  return {
    slab,
    vp: f32Vp,
    camPos: [0, 0, 5],
    viewportPx: [1280, 720],
    window: { originPx: [0, 0], sizePx: [1280, 720] },
  };
}

/**
 * The pass over a runtime holding `renderer` and texture slots reporting the given
 * ids resident (`current()` non-null), and the body-state snapshot pinned to `bodies`.
 */
function makeFixture(
  renderer: unknown,
  bodies: readonly SeededPlanet[],
  residentIds: readonly string[],
) {
  const textureSlots = new Map(
    residentIds.map((id) => [`${id}:surface`, { current: () => ({}) as ImageBitmap }]),
  );
  vi.mocked(sceneBodyStates).mockReturnValue(seededBodyStates(0, bodies));
  const state = {} as EngineState;
  const rings = ringsPass({ ringRenderer: renderer, textureSlots } as unknown as BodyRuntime);
  return { state, rings };
}

function makeRendererSpy() {
  return { draw: vi.fn<(pass: GPURenderPassEncoder, uniforms: Float32Array) => void>() };
}

describe('ringsPass.enabled', () => {
  it('is false when the ring strip is NOT resident', () => {
    const { state, rings } = makeFixture(makeRendererSpy(), [saturnBody()], []);
    expect(rings.enabled(state, makeCtx(), makeBodyView(asSceneBodyId('saturn')))).toBe(false);
  });

  it('draws only for a body with a ring row: false for earth, true for saturn', () => {
    const { state, rings } = makeFixture(
      makeRendererSpy(),
      [earthBody(), saturnBody()],
      ['saturn-ring'],
    );
    const ctx = makeCtx();
    expect(rings.enabled(state, ctx, makeBodyView(asSceneBodyId('earth')))).toBe(false);
    expect(rings.enabled(state, ctx, makeBodyView(asSceneBodyId('saturn')))).toBe(true);
  });
});

describe('ringsPass.draw', () => {
  it('draws exactly once across an earth row and a saturn row — the saturn row only', () => {
    const renderer = makeRendererSpy();
    const { state, rings } = makeFixture(renderer, [earthBody(), saturnBody()], ['saturn-ring']);
    const ctx = makeCtx();

    rings.draw(PASS_STUB, makeBodyView(asSceneBodyId('earth')), ctx, state);
    rings.draw(PASS_STUB, makeBodyView(asSceneBodyId('saturn')), ctx, state);

    expect(renderer.draw).toHaveBeenCalledTimes(1);
  });

  it('composes the MVP from view.slab.vp (never view.vp), scaled to the ring OUTER radius, from ctx.bodyPose', () => {
    mvpMock.mockClear();
    camLocalMock.mockClear();
    const renderer = makeRendererSpy();
    const view = makeBodyView(asSceneBodyId('saturn'));
    const saturn = saturnBody();
    const { state, rings } = makeFixture(renderer, [saturn], ['saturn-ring']);

    rings.draw(PASS_STUB, view, makeCtx(), state);

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
    const { state, rings } = makeFixture(renderer, [saturn], ['saturn-ring']);

    rings.draw(PASS_STUB, makeBodyView(asSceneBodyId('saturn')), makeCtx(), state);

    expect(camLocalMock).toHaveBeenCalledTimes(1);
    expect(camLocalMock.mock.calls[0]![0]).toBe(STUB_POSE.eyeRelBodyM);
    // NOT the ring's outer radius — the fragment's in-front-of-planet test
    // wants "planet radii", the same frame texturedBodiesPass's Minnaert
    // term uses.
    expect(camLocalMock.mock.calls[0]![1]).toBe(saturn.surface.datumRadiusM);
    expect(camLocalMock.mock.calls[0]![1]).not.toBeCloseTo(
      SATURN_RING.outerRadiusKm * SCALE_UNITS.KM_TO_M,
    );
  });

  it('packs the host sun@16..18, planetRadiusRatio@19, camPosLocal@20..22 and innerRatio@23', () => {
    const renderer = makeRendererSpy();
    const saturn = saturnBody();
    const { state, rings } = makeFixture(renderer, [saturn], ['saturn-ring']);

    rings.draw(PASS_STUB, makeBodyView(asSceneBodyId('saturn')), makeCtx(), state);

    expect(renderer.draw).toHaveBeenCalledTimes(1);
    const [pass, u] = renderer.draw.mock.calls[0]!;
    expect(pass).toBe(PASS_STUB);
    expect(u).toBeInstanceOf(Float32Array);
    expect(u).toHaveLength(24);

    const expectedSun = sunDirLocal(saturn.positionMpc, RENDER_ORIGIN_MPC, saturn.orientation);
    expect(u[16]).toBeCloseTo(expectedSun[0]);
    expect(u[17]).toBeCloseTo(expectedSun[1]);
    expect(u[18]).toBeCloseTo(expectedSun[2]);
    expect(u[19]).toBeCloseTo(
      (saturn.surface.datumRadiusM * SCALE_UNITS.M_TO_KM) / SATURN_RING.outerRadiusKm,
    );
    // camPosLocal is mocked: pin the PACKED value to the mock's return.
    expect(u[20]).toBe(Math.fround(MOCK_CAM_LOCAL[0]));
    expect(u[21]).toBe(Math.fround(MOCK_CAM_LOCAL[1]));
    expect(u[22]).toBe(Math.fround(MOCK_CAM_LOCAL[2]));
    expect(u[23]).toBeCloseTo(SATURN_RING.innerRadiusKm / SATURN_RING.outerRadiusKm);
  });
});
