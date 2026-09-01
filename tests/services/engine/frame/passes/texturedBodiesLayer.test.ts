/**
 * texturedBodiesLayer — unit tests for the `textured` branch of the body
 * partition, one `'body'`-slab content row per body.
 *
 * Load-bearing assertions:
 *
 *   1. The f64 seam — the MVP composes from the slab's `Float64Array`
 *      view-projection (`view.slab.vp`), NOT the f32-narrowed `view.vp`
 *      (identity-pinned via a mocked `composeBodySlabMvp`), and reads the
 *      pose off `ctx.bodyPose(bodyId)` rather than re-deriving it.
 *   2. The partition gate — a row draws ONLY when its `bodyId` is in the
 *      `textured` branch (resolved AND its surface texture is resident);
 *      otherwise it is flat (drawn by `planetsLayer`, not here). The
 *      cross-layer no-double-draw invariant lives in `planetsLayer.test.ts`.
 *   3. The ring ratios are DATA: Saturn packs its `SCENE_RINGS` radii in
 *      planet-radius units; a ringless body packs zeros (the fragment's "no
 *      ring" sentinel). Minnaert limb darkening is the same data-gate.
 */

import { describe, it, expect, vi } from 'vitest';

import { texturedBodiesLayer } from '../../../../../src/services/engine/frame/passes/texturedBodiesLayer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { SCENE_RINGS } from '../../../../../src/data/bodies/sceneRings';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { LIMB_DARKENING_PARAMS } from '../../../../../src/data/bodies/limbDarkeningParams';
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
import type { TextureKind } from '../../../../../src/@types/data/TextureKind';
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
    return m;
  }),
}));

const mvpMock = composeBodySlabMvp as unknown as ReturnType<typeof vi.fn>;
const camLocalMock = bodySlabCamLocal as unknown as ReturnType<typeof vi.fn>;

const IDENTITY_MAT3 = [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as BodyState['orientation'];

/** A body sitting `radiusM·5` down +x — firmly resolved on the fixture viewport. */
function bodyAt(id: string, radiusM: number): SeededPlanet {
  const distanceM = radiusM * 5;
  return {
    id,
    label: id,
    radiusM,
    albedo: [0.5, 0.5, 0.5],
    positionMpc: [distanceM * SCALE_UNITS.M_TO_MPC, 0, 0],
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
 * A `texturedBodyRenderer` spy whose `hasMap('surface')` reports resident for
 * exactly the given ids — the fake's stand-in for "a real surface texture is
 * bound", a rendering fact asked of the renderer.
 */
function makeRendererSpy(residentIds: readonly string[] = []) {
  return {
    draw: vi.fn<(pass: GPURenderPassEncoder, id: string, uniforms: Float32Array) => void>(),
    hasMap: vi.fn(
      (id: string, kind: TextureKind) => kind === 'surface' && residentIds.includes(id),
    ),
  };
}

function makeState(renderer: unknown, bodies: readonly PlanetBody[]): EngineState {
  return {
    gpu: { texturedBodyRenderer: renderer },
    data: { bodies: { planets: bodies } },
  } as unknown as EngineState;
}

describe('texturedBodiesLayer.enabled', () => {
  it('is false while the texturedBodyRenderer handle is null (bare ctx short-circuits)', () => {
    const state = makeState(null, []);
    expect(texturedBodiesLayer.enabled(state, CTX_STUB, makeBodyView('mars' as BodyId))).toBe(
      false,
    );
  });

  it('is false beyond the foreground gate even for a resident resolved body', () => {
    const state = makeState(makeRendererSpy(['mars']), [bodyAt('mars', 3390000)]);
    expect(
      texturedBodiesLayer.enabled(
        state,
        makeCtx(FOREGROUND_MAX_DISTANCE_MPC),
        makeBodyView('mars' as BodyId),
      ),
    ).toBe(false);
  });

  it('is false for a registry body that is NOT resident (it is flat, drawn by planetsLayer)', () => {
    const state = makeState(makeRendererSpy([]), [bodyAt('mars', 3390000)]);
    expect(texturedBodiesLayer.enabled(state, makeCtx(), makeBodyView('mars' as BodyId))).toBe(
      false,
    );
  });

  it('is true for a resident row, false for a different body`s row', () => {
    const state = makeState(makeRendererSpy(['mars']), [
      bodyAt('mars', 3390000),
      bodyAt('jupiter', 69911000),
    ]);
    const ctx = makeCtx();
    expect(texturedBodiesLayer.enabled(state, ctx, makeBodyView('mars' as BodyId))).toBe(true);
    expect(texturedBodiesLayer.enabled(state, ctx, makeBodyView('jupiter' as BodyId))).toBe(false);
  });
});

describe('texturedBodiesLayer.draw', () => {
  it('composes the MVP from view.slab.vp (never view.vp) and the pose off ctx.bodyPose', () => {
    mvpMock.mockClear();
    camLocalMock.mockClear();
    const mars = bodyAt('mars', 3390000);
    const state = makeState(makeRendererSpy(['mars']), [mars]);
    const ctx = makeCtx();
    const view = makeBodyView('mars' as BodyId);

    texturedBodiesLayer.draw(PASS_STUB, view, ctx, state);

    expect(mvpMock).toHaveBeenCalledTimes(1);
    const call = mvpMock.mock.calls[0]!;
    expect(call[0]).toBe(view.slab.vp);
    expect(call[0]).not.toBe(view.vp);
    expect(call[1]).toBe(STUB_POSE.eyeRelBodyM);
    expect(call[2]).toBe(mars.radiusM);

    expect(camLocalMock).toHaveBeenCalledTimes(1);
    expect(camLocalMock.mock.calls[0]![0]).toBe(STUB_POSE.eyeRelBodyM);
    // camPosLocal uses the SAME radius the mvp did (the Minnaert view-cosine
    // frame must match the frame the vertices were transformed into).
    expect(camLocalMock.mock.calls[0]![1]).toBe(mars.radiusM);
  });

  it('draws only the row matching its own body, never a neighbour`s', () => {
    const mars = bodyAt('mars', 3390000);
    const jupiter = bodyAt('jupiter', 69911000);
    const renderer = makeRendererSpy(['mars', 'jupiter']);
    const state = makeState(renderer, [mars, jupiter]);
    const ctx = makeCtx();

    texturedBodiesLayer.draw(PASS_STUB, makeBodyView('mars' as BodyId), ctx, state);
    expect(renderer.draw).toHaveBeenCalledTimes(1);
    expect(renderer.draw.mock.calls[0]![1]).toBe('mars');

    texturedBodiesLayer.draw(PASS_STUB, makeBodyView('jupiter' as BodyId), ctx, state);
    expect(renderer.draw).toHaveBeenCalledTimes(2);
    expect(renderer.draw.mock.calls[1]![1]).toBe('jupiter');
  });

  it('packs a length-28 uniform record with sunDirLocal@16..18 and Minnaert params@22..23', () => {
    const mars = bodyAt('mars', 3390000);
    const jupiter = bodyAt('jupiter', 69911000); // has a LIMB_DARKENING_PARAMS row
    const renderer = makeRendererSpy(['mars', 'jupiter']);
    const state = makeState(renderer, [mars, jupiter]);
    const ctx = makeCtx();

    texturedBodiesLayer.draw(PASS_STUB, makeBodyView('mars' as BodyId), ctx, state);
    texturedBodiesLayer.draw(PASS_STUB, makeBodyView('jupiter' as BodyId), ctx, state);

    const u0 = renderer.draw.mock.calls[0]![2];
    expect(u0).toBeInstanceOf(Float32Array);
    expect(u0).toHaveLength(28);
    const expectedSun = sunDirLocal(mars.positionMpc, RENDER_ORIGIN_MPC, mars.orientation);
    expect(u0[16]).toBeCloseTo(expectedSun[0]);
    expect(u0[17]).toBeCloseTo(expectedSun[1]);
    expect(u0[18]).toBeCloseTo(expectedSun[2]);
    // Mars has no LIMB_DARKENING_PARAMS row ⇒ identity.
    expect(u0[22]).toBe(0);
    expect(u0[23]).toBe(1);

    const u1 = renderer.draw.mock.calls[1]![2];
    expect(u1[22]).toBeCloseTo(LIMB_DARKENING_PARAMS.jupiter!.strength);
    expect(u1[23]).toBeCloseTo(LIMB_DARKENING_PARAMS.jupiter!.exponent);

    // camPosLocal (mocked) at floats 24..26.
    expect(u0[24]).toBe(Math.fround(MOCK_CAM_LOCAL[0]));
    expect(u0[25]).toBe(Math.fround(MOCK_CAM_LOCAL[1]));
    expect(u0[26]).toBe(Math.fround(MOCK_CAM_LOCAL[2]));
  });

  it('packs Saturn`s SCENE_RINGS radii as ring ratios and zeros for a ringless body', () => {
    const saturn = bodyAt('saturn', 58232000);
    const mars = bodyAt('mars', 3390000);
    const renderer = makeRendererSpy(['saturn', 'mars']);
    const state = makeState(renderer, [saturn, mars]);
    const ctx = makeCtx();

    texturedBodiesLayer.draw(PASS_STUB, makeBodyView('saturn' as BodyId), ctx, state);
    texturedBodiesLayer.draw(PASS_STUB, makeBodyView('mars' as BodyId), ctx, state);

    const ring = SCENE_RINGS.find((r) => r.bodyId === 'saturn')!;
    const saturnU = renderer.draw.mock.calls[0]![2];
    expect(saturnU[20]).toBeCloseTo(ring.innerRadiusKm / (saturn.radiusM * SCALE_UNITS.M_TO_KM));
    expect(saturnU[21]).toBeCloseTo(ring.outerRadiusKm / (saturn.radiusM * SCALE_UNITS.M_TO_KM));

    const marsU = renderer.draw.mock.calls[1]![2];
    expect(marsU[20]).toBe(0);
    expect(marsU[21]).toBe(0);
  });

  it('is a no-op when the texturedBodyRenderer handle is null (pre-bootstrap)', () => {
    const view = makeBodyView('mars' as BodyId);
    const state = makeState(null, [bodyAt('mars', 3390000)]);
    expect(() => texturedBodiesLayer.draw(PASS_STUB, view, makeCtx(), state)).not.toThrow();
  });
});
