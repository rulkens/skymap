/**
 * atmosphereShellPass — the in-scatter atmosphere's `'body'`-slab content row, invoked once
 * per body-m row. Load-bearing: the slab's f64 `view.slab.vp` must reach `composeBodySlabMvp`
 * (not the f32 `view.vp`) and the pose must come off `ctx.bodyPose(bodyId)`; each row draws
 * with its OWN `ATMOSPHERE_PARAMS` entry, and a body with none (the Moon) draws nothing.
 * `composeBodySlabMvp` and `bodySlabCamLocal` are mocked; their math has its own tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { mat4d } from 'wgpu-matrix';

import { narrowMat4 } from '../../../../src/utils/math/narrowMat4';
import { atmosphereShellPass } from '../../../../src/layers/body/passes/atmosphereShellPass';
import { ATMOSPHERE_PARAMS } from '../../../../src/layers/body/present/atmosphereParams';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { BODY_SLAB_ROWS } from '../../../../src/layers/body/present/bodySlabRows';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { makeSlab } from '../../../fixtures/makeSlab';
import { seededBodyStates } from '../../../helpers/frame/seededBodyStates';
import type { SeededBody } from '../../../helpers/frame/SeededBody';
import type { AtmosphereShellDepth } from '../../../../src/layers/body/@types/AtmosphereShellDepth';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { SceneBodyId } from '../../../../src/@types/scene/SceneBodyId';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { BodyRuntime } from '../../../../src/layers/body/@types/BodyRuntime';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { BodyRelativePose } from '../../../../src/@types/engine/camera/BodyRelativePose';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// packAtmosphereUniforms runs for real so the packed bottomRadius reveals which
// ATMOSPHERE_PARAMS row fed it.
const MOCK_MVP = new Float64Array(16);
const MOCK_CAM_LOCAL: Vec3 = [1.0, 2.0, 3.0];
vi.mock('../../../../src/utils/camera/composeBodySlabMvp', () => ({
  composeBodySlabMvp: vi.fn<() => Float64Array>(() => MOCK_MVP),
}));
vi.mock('../../../../src/utils/camera/bodySlabCamLocal', () => ({
  bodySlabCamLocal: vi.fn<() => Vec3>(() => MOCK_CAM_LOCAL),
}));
import { composeBodySlabMvp } from '../../../../src/utils/camera/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../../src/utils/camera/bodySlabCamLocal';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';

// atmosphereDrawList reads live body positions off this snapshot; stub it to the fixtures' refs.
vi.mock('../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn(() => seededBodyStates(0, SEEDED_BODIES)),
}));

const IDENTITY_MAT3 = [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as BodyState['orientation'];

// Tiny DISTINCT offsets from the render origin: real Mars distance falls below the sub-pixel
// cull, and 1e-15 keeps every body non-sub-pixel while `bodyRelativePose` never has to cancel
// a large shared magnitude.
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

// OUTSIDE every fixture's atmosphere band (100,000 km out): this layer is the
// outside-only half, and an eye inside the band routes the row to
// `aerialPerspectivePass` instead.
const STUB_POSE: BodyRelativePose = { eyeRelBodyM: [0, 0, 1e8], basisM: IDENTITY_MAT3 };
/** Well inside Earth's band (1,000 km from its centre) — `aerial-perspective`'s camera. */
const INSIDE_POSE: BodyRelativePose = { eyeRelBodyM: [0, 0, 1e6], basisM: IDENTITY_MAT3 };

const mvpMock = composeBodySlabMvp as unknown as ReturnType<typeof vi.fn>;
const camLocalMock = bodySlabCamLocal as unknown as ReturnType<typeof vi.fn>;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setIndexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  drawIndexed: vi.fn(),
} as unknown as GPURenderPassEncoder;

/** A ctx with every body row active; `bodyPose` returns one fixed pose, so only the eye's
 *  distance (inside or outside the band) matters. */
// 720-px viewport, 60° fovY, tangent-exact.
const FIXTURE_PX_PER_RAD = 720 / (2 * Math.tan((60 * Math.PI) / 180 / 2));

function makeCtx(pose = STUB_POSE): FrameView {
  return {
    drawCamPos: [0, 0, 0],
    bodyPose: (() => pose) as FrameView['bodyPose'],
    drawPxPerRad: FIXTURE_PX_PER_RAD,
    snapshot: {
      renderTargets: { farDepthView: () => FAR_DEPTH_VIEW },
      slabBodyCandidates: BODY_SLAB_ROWS,
    },
  } as unknown as FrameView;
}

const FAR_DEPTH_VIEW = { label: 'far-placeholder' } as unknown as GPUTextureView;
const ROW_DEPTH_VIEW = { label: 'foreground:0-depth' } as unknown as GPUTextureView;

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

const SEEDED_BODIES = [SEEDED_EARTH, SEEDED_MARS, SEEDED_MOON];

const STATE = {
  settings: { earth: { atmosphereExposure: ATMOSPHERE_PARAMS.earth!.exposure } },
} as unknown as EngineState;

function makeFixture(renderer: unknown) {
  const pass = atmosphereShellPass({ atmosphereShellRenderer: renderer } as unknown as BodyRuntime);
  return { state: STATE, pass };
}

describe('atmosphereShellPass.enabled', () => {
  it('is true for earth’s and mars’s own body-m rows, false for the moon’s (no ATMOSPHERE_PARAMS row)', () => {
    const { state, pass } = makeFixture({ draw: vi.fn() });
    const ctx = makeCtx();
    expect(pass.enabled(state, ctx, makeBodyView(asSceneBodyId('earth')))).toBe(true);
    expect(pass.enabled(state, ctx, makeBodyView(asSceneBodyId('mars')))).toBe(true);
    expect(pass.enabled(state, ctx, makeBodyView(asSceneBodyId('moon')))).toBe(false);
  });

  it('is false for a camera the shell encloses — that row is aerialPerspectivePass’s', () => {
    // Both draws on one body would double its in-scatter, and the proxy mesh
    // loses its near wall from inside; the two passes split on this one flag.
    const { state, pass } = makeFixture({ draw: vi.fn() });
    const ctx = makeCtx(INSIDE_POSE);
    expect(pass.enabled(state, ctx, makeBodyView(asSceneBodyId('earth')))).toBe(false);
  });
});

describe('atmosphereShellPass.draw', () => {
  it('feeds mvp/camLocal the slab f64 vp and the pose off ctx.bodyPose, never view.vp', () => {
    mvpMock.mockClear();
    camLocalMock.mockClear();
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const { state, pass } = makeFixture({ draw: drawSpy });
    const ctx = makeCtx();
    const view = makeBodyView(asSceneBodyId('earth'));

    pass.draw(PASS_STUB, view, ctx, state);

    expect(mvpMock).toHaveBeenCalledTimes(1);
    const call = mvpMock.mock.calls[0]!;
    expect(call[0]).toBe(view.slab.vp);
    expect(call[0]).not.toBe(view.vp);
    // Second arg is the pose's eyeRelBodyM, forwarded by reference — proof the
    // pose came off ctx.bodyPose rather than a re-derivation.
    expect(call[1]).toBe(STUB_POSE.eyeRelBodyM);
    // Third arg is the atmosphere-TOP radius in METRES (km → m, not km → Mpc):
    const expectedTopM = ATMOSPHERE_PARAMS.earth!.atmosphereTopKm * SCALE_UNITS.KM_TO_M;
    expect(call[2]).toBeCloseTo(expectedTopM);

    expect(camLocalMock.mock.calls[0]![0]).toBe(STUB_POSE.eyeRelBodyM);
    expect(camLocalMock.mock.calls[0]![1]).toBeCloseTo(expectedTopM);
  });

  it('draws each row with ITS OWN ATMOSPHERE_PARAMS entry, and skips a row with no atmosphere table entry', () => {
    const drawSpy =
      vi.fn<(pass: GPURenderPassEncoder, bodyId: string, uniforms: Float32Array) => void>();
    const { state, pass } = makeFixture({ draw: drawSpy });
    const ctx = makeCtx();

    pass.draw(PASS_STUB, makeBodyView(asSceneBodyId('earth')), ctx, state);
    pass.draw(PASS_STUB, makeBodyView(asSceneBodyId('mars')), ctx, state);
    pass.draw(PASS_STUB, makeBodyView(asSceneBodyId('moon')), ctx, state);

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

  it('hands the row’s sampled depth over with the frame that unprojects it, scaled to this body', () => {
    // The fragment ends every ray at this depth, in atmosphere-top units — so
    // a `kmToLocal` taken from the wrong body (or dropped) would cut the march
    // at a distance that is right in km and wrong by a factor of the radius.
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const { state, pass } = makeFixture({ draw: drawSpy });
    const view = makeBodyView(asSceneBodyId('mars'));

    pass.draw(
      PASS_STUB,
      { ...view, sampledDepth: { view: ROW_DEPTH_VIEW, row: view.slab } },
      makeCtx(),
      state,
    );

    const depth = drawSpy.mock.calls[0]![3] as AtmosphereShellDepth;
    expect(depth.view).toBe(ROW_DEPTH_VIEW);
    expect(depth.frame).not.toBeNull();
    expect(depth.viewportPx).toBe(view.viewportPx);
    expect(depth.kmToLocal).toBeCloseTo(1 / ATMOSPHERE_PARAMS.mars!.atmosphereTopKm);
  });

  it('binds the far placeholder, never the real view, when no depth row resolves', () => {
    // A step with no `{ sample }` marker (a capture face) leaves `sampledDepth`
    // undefined; pairing a null frame with the real texture would let the
    // fragment unproject live depth through an identity matrix.
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const { state, pass } = makeFixture({ draw: drawSpy });

    pass.draw(PASS_STUB, makeBodyView(asSceneBodyId('earth')), makeCtx(), state);

    const depth = drawSpy.mock.calls[0]![3] as AtmosphereShellDepth;
    expect(depth.frame).toBeNull();
    expect(depth.view).toBe(FAR_DEPTH_VIEW);
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

    // Clip point [7, 3, -2, 1]: local = 0.5*(7-5, 3, -2) = (1, 1.5, -1). Affine only, so w stays 1;
    // the test still divides by w to exercise the real un-project path.
    const clip: [number, number, number, number] = [7, 3, -2, 1];

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
