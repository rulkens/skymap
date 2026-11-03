/**
 * planetsPass — the seeded-planets `'body'`-slab content row. Pinned: (1) the f64 seam — MVP from
 * `view.slab.vp`, NOT the f32 `view.vp`, with the pose off `ctx.bodyPose(bodyId)`; (2) the partition
 * boundary — a row draws ONLY when its `bodyId` is in the `flat` branch, so `texturedBodiesPass` and
 * `planetsPass` never both draw a body (the z-fight `sceneBodyPartition` prevents); (3) the MVP /
 * `bodySlabCamLocal` pairing — the renderer ray-traces its silhouette from the packed camera, which
 * must be measured in the frame the MVP's model scale (`datumRadiusM`) defines.
 */

import { positionedBodiesOf } from '../../../helpers/frame/positionedBodiesOf';
import { describe, it, expect, vi } from 'vitest';

import { planetsPass } from '../../../../src/layers/body/passes/planetsPass';
import { texturedBodiesPass } from '../../../../src/layers/body/passes/texturedBodiesPass';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { INSTANCE_FLOATS } from '../../../../src/layers/body/render/planetRenderer';
import { BODY_PICK_MIN_RADIUS_PX } from '../../../../src/services/engine/helpers/minPickRadiusMpc';
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

// sunDirLocal runs for real so the packed sun direction reveals a drift in the rotate/pack.
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
// Production reads the static scene tables, so `makeCtx` pins the snapshot to the fixture bodies.
vi.mock('../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn(),
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
    id: asSceneBodyId(id),
    label: id,
    captionKind: 'planet',
    resolvePx: 3,
    surface: { datumRadiusM: radiusM, reliefM: [0, 0] },
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

/** A ctx comfortably inside the shared foreground gate, with a fixed pose for every body. */
function makeCtx(planets: readonly SeededPlanet[]): FrameView {
  vi.mocked(sceneBodyStates).mockReturnValue(seededBodyStates(0, planets));
  return {
    snapshot: { meshBodies: [], sceneBodies: positionedBodiesOf(planets) },
    drawCamPos: [0, 0, 0],
    bodyPose: (() => STUB_POSE) as FrameView['bodyPose'],
    canvasSize: { width: 1280, height: 720 },
    drawPxPerRad: 720 / (2 * Math.tan(Math.PI / 6)),
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

function makeRendererSpy() {
  return {
    draw: vi.fn<(pass: GPURenderPassEncoder, bodyId: string, instance: Float32Array) => void>(),
  };
}

/**
 * The partition fixture: `mercury` not resident (flat), `mars` resident (textured),
 * `moon` deep sub-pixel (glint); the runtime's two renderers are spies.
 */
function makePartitionFixture() {
  const flat = bodyAt('mercury', 2440000);
  const textured = bodyAt('mars', 3390000);
  const glint = glintBodyAt('moon', 1737000);
  const runtime = {
    planetRenderer: makeRendererSpy(),
    texturedBodyRenderer: {
      draw: vi.fn(),
      hasMap: (id: string, kind: string) => id === 'mars' && kind === 'surface',
    },
  };
  const state = { gpu: {} } as unknown as EngineState;
  return {
    state,
    bodies: [flat, textured, glint],
    runtime,
    planets: planetsPass(runtime as unknown as BodyRuntime),
  };
}

describe('planetsPass.enabled', () => {
  it('is true for the flat-branch row, false for the textured and glint rows', () => {
    const { state, bodies, planets } = makePartitionFixture();
    const ctx = makeCtx(bodies);
    expect(planets.enabled(state, ctx, makeBodyView(asSceneBodyId('mercury')))).toBe(true);
    expect(planets.enabled(state, ctx, makeBodyView(asSceneBodyId('mars')))).toBe(false);
    expect(planets.enabled(state, ctx, makeBodyView(asSceneBodyId('moon')))).toBe(false);
  });
});

describe('planetsPass.draw — one body per row (partition boundary)', () => {
  it('draws only the flat-branch body matching this row', () => {
    const { state, bodies, runtime, planets } = makePartitionFixture();
    const renderer = runtime.planetRenderer;
    const ctx = makeCtx(bodies);

    planets.draw(PASS_STUB, makeBodyView(asSceneBodyId('mars')), ctx, state); // textured row
    planets.draw(PASS_STUB, makeBodyView(asSceneBodyId('moon')), ctx, state); // glint row
    expect(renderer.draw).not.toHaveBeenCalled();

    planets.draw(PASS_STUB, makeBodyView(asSceneBodyId('mercury')), ctx, state); // flat row
    expect(renderer.draw).toHaveBeenCalledTimes(1);
    expect(renderer.draw.mock.calls[0]![1]).toBe('mercury'); // this row's bodyId
  });

  it('texturedBodiesPass and planetsPass never both draw the same body', () => {
    const { state, bodies, runtime, planets } = makePartitionFixture();
    const textured = texturedBodiesPass(runtime as unknown as BodyRuntime);
    const planetsRenderer = runtime.planetRenderer;
    const texturedRenderer = runtime.texturedBodyRenderer;
    const ctx = makeCtx(bodies);

    const drawnByPlanets = new Set<string>();
    const drawnByTextured = new Set<string>();
    for (const id of ['mercury', 'mars', 'moon']) {
      const view = makeBodyView(asSceneBodyId(id));

      const beforeP = planetsRenderer.draw.mock.calls.length;
      planets.draw(PASS_STUB, view, ctx, state);
      if (planetsRenderer.draw.mock.calls.length > beforeP) drawnByPlanets.add(id);

      const beforeT = texturedRenderer.draw.mock.calls.length;
      textured.draw(PASS_STUB, view, ctx, state);
      if (texturedRenderer.draw.mock.calls.length > beforeT) drawnByTextured.add(id);
    }

    expect(drawnByPlanets).toEqual(new Set(['mercury']));
    expect(drawnByTextured).toEqual(new Set(['mars']));
    for (const id of drawnByPlanets) expect(drawnByTextured.has(id)).toBe(false);
  });
});

describe('planetsPass.draw — the f64 seam and packed record layout', () => {
  it('composes the MVP from view.slab.vp (never view.vp) and the pose off ctx.bodyPose', () => {
    mvpMock.mockClear();
    camLocalMock.mockClear();
    const { state, bodies, runtime, planets } = makePartitionFixture();
    const renderer = runtime.planetRenderer;
    const ctx = makeCtx(bodies);
    const view = makeBodyView(asSceneBodyId('mercury'));
    const mercury = bodies[0]!;

    planets.draw(PASS_STUB, view, ctx, state);

    expect(mvpMock).toHaveBeenCalledTimes(1);
    const call = mvpMock.mock.calls[0]!;
    expect(call[0]).toBe(view.slab.vp);
    expect(call[0]).not.toBe(view.vp);
    // Second arg is the pose's eyeRelBodyM by reference: proof the layer read ctx.bodyPose.
    expect(call[1]).toBe(STUB_POSE.eyeRelBodyM);
    expect(call[2]).toBe(mercury.surface.datumRadiusM);

    expect(camLocalMock).toHaveBeenCalledTimes(1);
    expect(camLocalMock.mock.calls[0]![0]).toBe(STUB_POSE.eyeRelBodyM);
    expect(camLocalMock.mock.calls[0]![1]).toBe(mercury.surface.datumRadiusM);

    expect(renderer.draw).toHaveBeenCalledTimes(1);
  });

  it('packs albedo@16..18, sunDirLocal@20..22 and camPosLocal@24..26 into a 28-float record', () => {
    const { state, bodies, runtime, planets } = makePartitionFixture();
    const renderer = runtime.planetRenderer;
    const ctx = makeCtx(bodies);
    const mercury = bodies[0]!;

    planets.draw(PASS_STUB, makeBodyView(asSceneBodyId('mercury')), ctx, state);

    const [, bodyId, staging] = renderer.draw.mock.calls[0]!;
    expect(bodyId).toBe('mercury');
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

    // camPosLocal is mocked: pin the PACKED value to the mock's return.
    expect(staging[24]).toBe(Math.fround(MOCK_CAM_LOCAL[0]));
    expect(staging[25]).toBe(Math.fround(MOCK_CAM_LOCAL[1]));
    expect(staging[26]).toBe(Math.fround(MOCK_CAM_LOCAL[2]));
    expect(staging[27]).toBe(0); // camPosLocal pad
  });
});

describe('planetsPass.pickEnabled (Bug A — textured-only row stays pickable)', () => {
  it('is true for the textured row even though enabled (flat-only) is false there', () => {
    const { state, bodies, planets } = makePartitionFixture();
    const ctx = makeCtx(bodies);
    const view = makeBodyView(asSceneBodyId('mars'));
    expect(planets.enabled(state, ctx, view)).toBe(false);
    expect(planets.pickEnabled!(state, ctx, view)).toBe(true);
  });

  it('is false for the glint row (neither flat nor textured)', () => {
    const { state, bodies, planets } = makePartitionFixture();
    const ctx = makeCtx(bodies);
    expect(planets.pickEnabled!(state, ctx, makeBodyView(asSceneBodyId('moon')))).toBe(false);
  });
});

describe('planetsPass.drawPick', () => {
  it('stamps the flat and textured rows, never the glint row', () => {
    const flat = bodyAt('mercury', 2440000);
    const textured = bodyAt('mars', 3390000);
    const glint = glintBodyAt('moon', 1737000);
    const pickRenderer = { drawSphere: vi.fn() };
    const state = { gpu: { bodyPickRenderer: pickRenderer } } as unknown as EngineState;
    const bodies = [flat, textured, glint];
    const planets = planetsPass({
      planetRenderer: makeRendererSpy(),
      texturedBodyRenderer: {
        hasMap: (id: string, kind: string) => id === 'mars' && kind === 'surface',
      },
    } as unknown as BodyRuntime);
    const ctx = makeCtx(bodies);

    planets.drawPick!(PASS_STUB, makeBodyView(asSceneBodyId('mercury')), ctx, state); // flat
    planets.drawPick!(PASS_STUB, makeBodyView(asSceneBodyId('mars')), ctx, state); // textured
    planets.drawPick!(PASS_STUB, makeBodyView(asSceneBodyId('moon')), ctx, state); // glint
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
    const planets = planetsPass({
      planetRenderer: makeRendererSpy(),
      texturedBodyRenderer: { hasMap: () => false },
    } as unknown as BodyRuntime);
    const state = { gpu: { bodyPickRenderer: { drawSphere: vi.fn() } } } as unknown as EngineState;
    const bodies: SeededPlanet[] = [{ ...bodyAt('mercury', radiusM), positionMpc: [0, 0, 0] }];
    const ctx = {
      ...makeCtx(bodies),
      bodyPose: (() => pose) as FrameView['bodyPose'],
      drawPxPerRad: pxPerRad,
    };

    planets.drawPick!(PASS_STUB, makeBodyView(asSceneBodyId('mercury')), ctx, state);

    expect(mvpMock).toHaveBeenCalledTimes(1);
    const radiusArg = mvpMock.mock.calls[0]![2] as number;
    const expectedFloor = (BODY_PICK_MIN_RADIUS_PX / pxPerRad) * dM;
    expect(radiusArg).toBeCloseTo(expectedFloor, 0);
    expect(radiusArg).toBeGreaterThan(radiusM); // the floor is genuinely active here
  });
});
