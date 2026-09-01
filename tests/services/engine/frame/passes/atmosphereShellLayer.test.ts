/**
 * atmosphereShellLayer — unit tests for the in-scatter atmosphere's `'body'`-
 * slab content row.
 *
 * Like the other body-slab layers, the load-bearing assertion is the f64
 * seam: the layer MUST feed `composeBodySlabMvp` the slab's `Float64Array`
 * view-projection (`view.slab.vp`), NOT the f32-narrowed `view.vp`, and MUST
 * read the pose off `ctx.bodyPose(bodyId)` rather than re-deriving it.
 * `composeBodySlabMvp` and `bodySlabCamLocal` are mocked to fixed values —
 * their own math is covered by their own test files.
 *
 * The layer is now invoked once PER body-m row (Task 7's frame-program
 * expansion), so the central new behaviour this suite pins is per-row
 * selection: two body-m rows (earth, mars) each draw with THEIR OWN
 * `ATMOSPHERE_PARAMS` entry, and a row for a body with no atmosphere table
 * entry (the Moon) draws nothing.
 */

import { describe, it, expect, vi } from 'vitest';
import { mat4d } from 'wgpu-matrix';

import { narrowMat4 } from '../../../../../src/utils/math/narrowMat4';
import { atmosphereShellLayer } from '../../../../../src/services/engine/frame/passes/atmosphereShellLayer';
import { ATMOSPHERE_PARAMS } from '../../../../../src/data/bodies/atmosphereParams';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCENE_EARTH } from '../../../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../../src/data/bodies/scenePlanets';
import { makeSlab } from '../../../../fixtures/makeSlab';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { BodyId } from '../../../../../src/@types/data/body/BodyId';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { EarthBody } from '../../../../../src/@types/scene/EarthBody';
import type { PlanetBody } from '../../../../../src/@types/scene/PlanetBody';
import type { BodyState } from '../../../../../src/@types/scene/BodyState';
import type { BodyRelativePose } from '../../../../../src/@types/engine/camera/BodyRelativePose';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

// Mock the two body-slab compose primitives — real math is covered by
// composeBodySlabMvp.test.ts / bodySlabCamLocal.test.ts. This suite pins the
// ARGUMENTS the layer feeds them, and lets packAtmosphereUniforms run for
// real so the packed bottomRadius reveals which ATMOSPHERE_PARAMS row fed it.
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

// atmosphereDrawList (unmocked — its own cull math is covered by
// atmosphereDrawList.test.ts) reads live body positions off this per-frame
// snapshot. Stub it to each fixture's own positionMpc/orientation refs, the
// same pattern earthLayer.test.ts uses, so the layer sees the exact fixture
// values.
type SeededBody = (EarthBody | PlanetBody) & Pick<BodyState, 'positionMpc' | 'orientation'>;
vi.mock('../../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn((state: EngineState): ReadonlyMap<string, BodyState> => {
    const m = new Map<string, BodyState>();
    const bodies = state.data.bodies as unknown as {
      earth: SeededBody | null;
      planets: readonly SeededBody[];
    };
    if (bodies.earth) m.set(bodies.earth.id, toBodyState(bodies.earth));
    for (const p of bodies.planets) m.set(p.id, toBodyState(p));
    return m;
  }),
}));
function toBodyState(b: SeededBody): BodyState {
  return { positionMpc: b.positionMpc, orientation: b.orientation, meanAnomalyRad: 0 };
}

const IDENTITY_MAT3 = [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as BodyState['orientation'];

// Positioned at tiny, DISTINCT offsets from the render origin — real Mars
// orbital distance would put it far below the sub-pixel cull for a camera
// framed on Earth, and this suite only cares about per-row selection, not
// orbital mechanics. `1e-15` keeps every body comfortably non-sub-pixel
// (apparent diameter tracks 1/distance) while the offsets stay small enough
// that `bodyRelativePose` is never asked to cancel a large shared magnitude.
const SEEDED_EARTH: SeededBody = {
  ...SCENE_EARTH,
  positionMpc: [-1e-15, 0, 0],
  orientation: IDENTITY_MAT3,
};
const SEEDED_MARS: SeededBody = {
  ...SCENE_PLANETS.find((p) => p.id === 'mars')!,
  positionMpc: [1e-15, 0, 0],
  orientation: IDENTITY_MAT3,
};
// The Moon carries NO `ATMOSPHERE_PARAMS` row — the data-gate case.
const SEEDED_MOON: SeededBody = {
  ...SCENE_PLANETS.find((p) => p.id === 'moon')!,
  positionMpc: [2e-15, 0, 0],
  orientation: IDENTITY_MAT3,
};

const STUB_POSE: BodyRelativePose = { eyeRelBodyM: [1, 2, 3], basisM: IDENTITY_MAT3 };

const mvpMock = composeBodySlabMvp as unknown as ReturnType<typeof vi.fn>;
const camLocalMock = bodySlabCamLocal as unknown as ReturnType<typeof vi.fn>;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setIndexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  drawIndexed: vi.fn(),
} as unknown as GPURenderPassEncoder;

/**
 * A ctx comfortably inside the shared foreground gate, with a `bodyPose`
 * stub returning one fixed non-null pose for every body — `composeBodySlabMvp`
 * is mocked, so the pose's actual geometry never matters, only that it is
 * non-null and gets forwarded.
 */
function makeCtx(distance = FOREGROUND_MAX_DISTANCE_MPC / 2): ReadyFrameContext {
  return {
    cam: { distance },
    drawCamPos: [0, 0, 0],
    bodyPose: (() => STUB_POSE) as ReadyFrameContext['bodyPose'],
    canvasSize: { width: 1280, height: 720 },
    fovYRad: (60 * Math.PI) / 180,
  } as unknown as ReadyFrameContext;
}

const CTX_STUB = {} as ReadyFrameContext;

function makeBodyView(bodyId: BodyId): SlabView {
  const f64Vp = Float64Array.from({ length: 16 }, (_, i) => i + 0.5);
  const f32Vp = new Float32Array(16);
  const slab: Slab = makeSlab({ vp: f64Vp, frame: { kind: 'body-m', bodyId } });
  return { slab, vp: f32Vp, camPos: [0, 0, 5], viewportPx: [1280, 720] };
}

function makeState(renderer: unknown): EngineState {
  return {
    gpu: { atmosphereShellRenderer: renderer },
    data: { bodies: { earth: SEEDED_EARTH, planets: [SEEDED_MARS, SEEDED_MOON] } },
    settings: { earth: { atmosphereExposure: ATMOSPHERE_PARAMS.earth!.exposure } },
  } as unknown as EngineState;
}

describe('atmosphereShellLayer.enabled', () => {
  it('is true for earth’s and mars’s own body-m rows, false for the moon’s (no ATMOSPHERE_PARAMS row)', () => {
    const state = makeState({ draw: vi.fn() });
    const ctx = makeCtx();
    expect(atmosphereShellLayer.enabled(state, ctx, makeBodyView('earth' as BodyId))).toBe(true);
    expect(atmosphereShellLayer.enabled(state, ctx, makeBodyView('mars' as BodyId))).toBe(true);
    expect(atmosphereShellLayer.enabled(state, ctx, makeBodyView('moon' as BodyId))).toBe(false);
  });

  it('is false while the atmosphereShellRenderer handle is null, even for a bare ctx (handle short-circuits first)', () => {
    const state = makeState(null);
    expect(atmosphereShellLayer.enabled(state, CTX_STUB, makeBodyView('earth' as BodyId))).toBe(
      false,
    );
  });
});

describe('atmosphereShellLayer.draw', () => {
  it('composes mvp/camLocal from the slab f64 vp and the pose off ctx.bodyPose, never view.vp', () => {
    mvpMock.mockClear();
    camLocalMock.mockClear();
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const state = makeState({ draw: drawSpy });
    const ctx = makeCtx();
    const view = makeBodyView('earth' as BodyId);

    atmosphereShellLayer.draw(PASS_STUB, view, ctx, state);

    expect(mvpMock).toHaveBeenCalledTimes(1);
    const call = mvpMock.mock.calls[0]!;
    expect(call[0]).toBe(view.slab.vp);
    expect(call[0]).not.toBe(view.vp);
    // Second arg is the pose's eyeRelBodyM, forwarded by reference — proof the
    // layer read ctx.bodyPose rather than re-deriving a pose of its own.
    expect(call[1]).toBe(STUB_POSE.eyeRelBodyM);
    // Third arg is the atmosphere-TOP radius in METRES (km → m, not km → Mpc):
    // the seam this task moved off the Mpc-based composeBodyMvp/camPosLocal.
    const expectedTopM = ATMOSPHERE_PARAMS.earth!.atmosphereTopKm * SCALE_UNITS.KM_TO_M;
    expect(call[2]).toBeCloseTo(expectedTopM);

    expect(camLocalMock).toHaveBeenCalledTimes(1);
    expect(camLocalMock.mock.calls[0]![0]).toBe(STUB_POSE.eyeRelBodyM);
    expect(camLocalMock.mock.calls[0]![1]).toBeCloseTo(expectedTopM);
  });

  it('draws each row with ITS OWN ATMOSPHERE_PARAMS entry, and skips a row with no atmosphere table entry', () => {
    const drawSpy =
      vi.fn<(pass: GPURenderPassEncoder, bodyId: string, uniforms: Float32Array) => void>();
    const state = makeState({ draw: drawSpy });
    const ctx = makeCtx();

    atmosphereShellLayer.draw(PASS_STUB, makeBodyView('earth' as BodyId), ctx, state);
    atmosphereShellLayer.draw(PASS_STUB, makeBodyView('mars' as BodyId), ctx, state);
    atmosphereShellLayer.draw(PASS_STUB, makeBodyView('moon' as BodyId), ctx, state);

    // Exactly two draws — the Moon's row (no ATMOSPHERE_PARAMS entry) is a no-op.
    expect(drawSpy).toHaveBeenCalledTimes(2);

    const [, earthBodyId, earthUniforms] = drawSpy.mock.calls[0]!;
    const [, marsBodyId, marsUniforms] = drawSpy.mock.calls[1]!;
    expect(earthBodyId).toBe('earth');
    expect(marsBodyId).toBe('mars');

    // Float index 19 (byte 76) is bottomRadius (packAtmosphereUniforms's byte
    // layout) — recomputed independently per body, so a row reading the WRONG
    // ATMOSPHERE_PARAMS entry (e.g. both rows packing Earth's ratio) fails here.
    const expectedEarthBottom =
      ATMOSPHERE_PARAMS.earth!.planetRadiusKm / ATMOSPHERE_PARAMS.earth!.atmosphereTopKm;
    const expectedMarsBottom =
      ATMOSPHERE_PARAMS.mars!.planetRadiusKm / ATMOSPHERE_PARAMS.mars!.atmosphereTopKm;
    expect(earthUniforms[19]).toBeCloseTo(expectedEarthBottom);
    expect(marsUniforms[19]).toBeCloseTo(expectedMarsBottom);
    expect(earthUniforms[19]).not.toBeCloseTo(marsUniforms[19]!, 3);
  });

  it('is a no-op when the atmosphereShellRenderer handle is null (pre-bootstrap)', () => {
    const state = makeState(null);
    const view = makeBodyView('earth' as BodyId);
    expect(() => atmosphereShellLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });

  it('dispatches inside=true / inside=false off the camLocal magnitude (atmosphere-top units)', () => {
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const state = makeState({ draw: drawSpy });
    const ctx = makeCtx();

    // camLocal is in atmosphere-top-radius units, so |camLocal| < 1 is the
    // inside test — drive it through the mocked bodySlabCamLocal per case.
    camLocalMock.mockReturnValueOnce([0.1, 0, 0]);
    atmosphereShellLayer.draw(PASS_STUB, makeBodyView('earth' as BodyId), ctx, state);
    camLocalMock.mockReturnValueOnce([5, 0, 0]);
    atmosphereShellLayer.draw(PASS_STUB, makeBodyView('earth' as BodyId), ctx, state);

    expect(drawSpy).toHaveBeenCalledTimes(2);
    expect(drawSpy.mock.calls[0]![3]).toBe(true);
    expect(drawSpy.mock.calls[1]![3]).toBe(false);
  });
});

describe('invMvp inversion sanity (mat4d.inverse dst-last / f64 contract)', () => {
  it('unprojects a clip-space point through narrowMat4(mat4d.inverse(mvp)) back to the known local point', () => {
    // mvp = T(5,0,0) * S(2,2,2): a column vector v transforms as
    // world = 2*v_local + (5,0,0) — scale first, then translate (read
    // right-to-left, same convention composeBodySlabMvp documents).
    const mvp = mat4d.multiply(mat4d.translation([5, 0, 0]), mat4d.scaling([2, 2, 2]));

    // Its inverse undoes that in the opposite order: local = 0.5*(world - (5,0,0)),
    // i.e. S(0.5) * T(-5,0,0). The expected values below are this hand-derived
    // formula, not mat4d.inverse's own output, so the assertion doesn't mirror
    // the function under test.
    const invMvp = mat4d.inverse(mvp);
    const invMvpF32 = narrowMat4(invMvp);

    // A chosen clip-space point [7, 3, -2, 1]. Hand-worked expected unprojection:
    // local = 0.5*(7-5, 3, -2) = (1, 1.5, -1). mvp/invMvp are pure affine
    // (translate+scale only), so w stays 1 throughout — no perspective divide
    // needed, but the test still divides by w to exercise the real un-project path.
    const clip: [number, number, number, number] = [7, 3, -2, 1];

    // Plain column-major 4x4 * vec4 — hand-rolled, one-off verification, not a
    // reusable util: out[row] = sum_col m[col*4 + row] * v[col].
    const unprojected: [number, number, number, number] = [0, 0, 0, 0];
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let col = 0; col < 4; col++) {
        sum += invMvpF32[col * 4 + row]! * clip[col]!;
      }
      unprojected[row] = sum;
    }
    const [x, y, z, w] = unprojected;

    expect(w).toBeCloseTo(1, 6);
    expect(x! / w!).toBeCloseTo(1, 6);
    expect(y! / w!).toBeCloseTo(1.5, 6);
    expect(z! / w!).toBeCloseTo(-1, 6);
  });
});
