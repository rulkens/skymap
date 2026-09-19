import { describe, it, expect } from 'vitest';
import { vec4 } from 'wgpu-matrix';

import { deriveFrameContext } from '../../../../src/services/engine/frame/frameContext';
import { deriveViewContext } from '../../../../src/services/engine/frame/deriveViewContext';
import { NEAR0 } from '../../../../src/services/engine/frame/slabs';
import { computeViewProj } from '../../../../src/utils/camera/computeViewProj';
import { orbitForwardOf } from '../../../../src/utils/camera/orbitForwardOf';
import { cameraBillboardBasis } from '../../../../src/utils/camera/cameraBillboardBasis';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { symmetricFrustum } from '../../../../src/utils/camera/symmetricFrustum';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { multiply3x3 } from '../../../../src/utils/math/multiply3x3';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { RENDER_ORIGIN_MPC } from '../../../../src/data/renderOrigin';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { ViewSpec } from '../../../../src/@types/engine/frame/ViewSpec';
import type { ViewFrustum } from '../../../../src/@types/camera/ViewFrustum';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { CameraProjection } from '../../../../src/@types/camera/CameraProjection';
import type { FramedCameraPose } from '../../../../src/@types/camera/FramedCameraPose';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// Roll and a rotated orientation basis keep every lookAt element off ±0, so the
// identity test compares real values rather than the sign of a zero.
const POSE: CameraPose = { target: [1, 2, 3], yaw: 0.3, pitch: 0.1, distance: 100, roll: 0.2 };
const PROJECTION: CameraProjection = { fovYRad: 1, aspect: 16 / 9, near: 0.1, far: 10000 };
const C = Math.cos(0.4);
const S = Math.sin(0.4);
const BASIS: Mat3 = [C, 0, -S, 0, 1, 0, S, 0, C];
const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
// Columns are the view's right | up | forward in camera image-plane coordinates.
const YAW_RIGHT: Mat3 = [0, 0, -1, 0, 1, 0, 1, 0, 0];
const YAW_LEFT: Mat3 = [0, 0, 1, 0, 1, 0, -1, 0, 0];
const BACK: Mat3 = [-1, 0, 0, 0, 1, 0, 0, 0, -1];
const UP: Mat3 = [1, 0, 0, 0, 0, -1, 0, 1, 0];

function makeState(arm: FramedCameraPose): EngineState {
  return {
    booted: true,
    gpu: { galaxyPointRenderer: {}, renderTargets: {}, galaxyPickRenderer: {}, compositor: {} },
    subsystems: { texturedDisks: {} },
    selectionRows: { hover: null, select: null, focus: null },
    data: { bodies: { earth: null, planets: [], stars: [], meshBodies: [] } },
    settings: {
      starCatalogs: { enabled: false, items: { famousStar: { enabled: false } } },
      bodies: { items: { sun: { enabled: false }, 's-star': { enabled: false } } },
    },
    picking: { pickInFlight: false, pointerDown: false, cursorTexPx: null },
    cameraRuntime: { outputs: { displayed: arm } },
  } as unknown as EngineState;
}

function mainContext(arm: FramedCameraPose = absoluteArm(POSE)): {
  state: EngineState;
  main: ReadyFrameContext;
} {
  const state = makeState(arm);
  const ctx = deriveFrameContext(
    state,
    { width: 1920, height: 1080 },
    POSE,
    arm,
    PROJECTION,
    BASIS,
    BASIS,
    0,
    0,
    CONST_J2000,
  );
  if (!ctx.isReady) throw new Error('fixture not ready');
  return { state, main: ctx };
}

function spec(overrides: Partial<ViewSpec> = {}): ViewSpec {
  return {
    rotation: IDENTITY,
    eyeOffsetMpc: [0, 0, 0],
    frustum: symmetricFrustum(PROJECTION.fovYRad, PROJECTION.aspect),
    sizePx: { width: 1920, height: 1080 },
    slot: 0,
    ...overrides,
  };
}

function view(overrides: Partial<ViewSpec> = {}): {
  main: ReadyFrameContext;
  v: ReadyFrameContext;
} {
  const { state, main } = mainContext();
  const v = deriveViewContext(state, main, spec(overrides));
  if (v === null) throw new Error('view not ready');
  return { main, v };
}

// A symmetric perspective vp's rows 0/1 run along right/up and its w row along
// forward (clip w = view depth), so the world basis reads straight off it.
function basisOf(vp: ArrayLike<number>): { right: Vec3; up: Vec3; forward: Vec3 } {
  return {
    right: normalize3([vp[0]!, vp[4]!, vp[8]!]),
    up: normalize3([vp[1]!, vp[5]!, vp[9]!]),
    forward: normalize3([vp[3]!, vp[7]!, vp[11]!]),
  };
}

function expectVec(got: Readonly<Vec3>, want: Readonly<Vec3>, digits = 6): void {
  for (let i = 0; i < 3; i++) expect(got[i]).toBeCloseTo(want[i]!, digits);
}

describe('deriveViewContext', () => {
  it('identity view spec derives the same context as no spec', () => {
    const { main, v } = view();
    expect(Array.from(v.vp)).toEqual(Array.from(main.vp));
    expect(v.slabs.length).toBe(main.slabs.length);
    v.slabs.forEach((slab, i) =>
      expect(Array.from(slab.vp)).toEqual(Array.from(main.slabs[i]!.vp)),
    );
    expect(v.drawCamPos).toEqual(main.drawCamPos);
    expect(v.drawPxPerRad).toBe(main.drawPxPerRad);
    expect(v.viewKind).toBe('frame');
  });

  it("a 90° yaw rotation turns the view's forward to the camera's right", () => {
    const { main, v } = view({ rotation: YAW_RIGHT });
    expectVec(basisOf(v.vp).forward, basisOf(main.vp).right);
    expectVec(basisOf(v.vp).up, basisOf(main.vp).up);
  });

  it("a turned view's ctx.cam is that view's camera, so every ctx.cam reader draws it", () => {
    const { main, v } = view({ rotation: YAW_RIGHT, eyeOffsetMpc: [0.5, 0, 0] });
    const want = basisOf(v.vp);
    expectVec(orbitForwardOf(v.cam), want.forward);
    expectVec(basisOf(main.vp).right, want.forward);
    // The billboard axes the Milky Way passes read, and the shells' target − eye.
    const billboard = cameraBillboardBasis(v.cam);
    expectVec(billboard.right, want.right);
    expectVec(billboard.up, want.up);
    const aim = [0, 1, 2].map((i) => v.cam.target[i]! - v.cam.position[i]!) as Vec3;
    expectVec(normalize3(aim), want.forward);
    const camVp = computeViewProj(v.cam, spec().frustum);
    for (let i = 0; i < 16; i++) expect(camVp[i]).toBeCloseTo(v.vp[i]!, 4);
  });

  it('five dome-like specs derive five distinct vps from one pose', () => {
    const { state, main } = mainContext();
    const cam = basisOf(main.vp);
    const camBasis: Mat3 = [...cam.right, ...cam.up, ...cam.forward];
    const faces = [IDENTITY, YAW_LEFT, YAW_RIGHT, BACK, UP].map((rotation, slot) => {
      const face = deriveViewContext(
        state,
        main,
        spec({
          rotation,
          frustum: symmetricFrustum(Math.PI / 2, 1),
          sizePx: { width: 512, height: 512 },
          slot,
        }),
      )!;
      expect(face.viewSlot).toBe(slot);
      const want = multiply3x3(camBasis, rotation);
      expectVec(basisOf(face.vp).forward, [want[6], want[7], want[8]]);
      return Array.from(face.vp);
    });
    for (let a = 0; a < faces.length; a++) {
      for (let b = a + 1; b < faces.length; b++) expect(faces[a]).not.toEqual(faces[b]);
    }
  });

  it('an asymmetric frustum survives into ctx.vp and drawPxPerRad', () => {
    const frustum: ViewFrustum = { tanLeft: -0.3, tanRight: 0.9, tanDown: -0.5, tanUp: 0.4 };
    const { main, v } = view({ frustum, sizePx: { width: 800, height: 600 } });
    // Each frustum edge, one unit deep along the camera's own axes, lands on NDC ±1.
    const { right, up, forward } = basisOf(main.vp);
    const ndc = (tx: number, ty: number): [number, number] => {
      const p = [0, 1, 2].map(
        (i) => v.drawCamPos[i]! + 10 * (right[i]! * tx + up[i]! * ty + forward[i]!),
      );
      const c = vec4.transformMat4([p[0]!, p[1]!, p[2]!, 1], Float64Array.from(v.vp));
      return [c[0]! / c[3]!, c[1]! / c[3]!];
    };
    expect(ndc(frustum.tanLeft, 0)[0]).toBeCloseTo(-1, 4);
    expect(ndc(frustum.tanRight, 0)[0]).toBeCloseTo(1, 4);
    expect(ndc(0, frustum.tanDown)[1]).toBeCloseTo(-1, 4);
    expect(ndc(0, frustum.tanUp)[1]).toBeCloseTo(1, 4);
    expect(v.drawPxPerRad).toBe(600 / 0.9);
    expect(v.fovYRad).toBeCloseTo(Math.atan(0.4) + Math.atan(0.5), 12);
    expect(v.canvasSize).toEqual({ width: 800, height: 600 });
  });

  it('an eye offset moves drawCamPos by the rotated offset and leaves the pose untouched', () => {
    // Half a unit along the turned view's right, which is the camera's back.
    const { main, v } = view({ rotation: YAW_RIGHT, eyeOffsetMpc: [0.5, 0, 0] });
    expect(v.cam.position).toEqual(v.drawCamPos);
    expect(v.cam.distance).toBe(main.cam.distance);
    const back = basisOf(main.vp).forward.map((x) => -0.5 * x) as Vec3;
    expectVec([0, 1, 2].map((i) => v.drawCamPos[i]! - main.drawCamPos[i]!) as Vec3, back);
    // Both matrices put the moved eye at the eye-space origin: clip (0, 0, ·, 0).
    const eye = v.drawCamPos;
    const cosmo = vec4.transformMat4([eye[0], eye[1], eye[2], 1], Float64Array.from(v.vp));
    const rel = [0, 1, 2].map((i) => eye[i]! - RENDER_ORIGIN_MPC[i]!);
    const near0 = vec4.transformMat4([rel[0]!, rel[1]!, rel[2]!, 1], v.slabs[NEAR0]!.vp);
    for (const clip of [cosmo, near0]) {
      expect(clip[0]).toBeCloseTo(0, 3);
      expect(clip[1]).toBeCloseTo(0, 3);
      expect(clip[3]).toBeCloseTo(0, 3);
    }
  });

  it('a body-arm camera keeps its body-arm slab path under a rotated view', () => {
    // Provider B's near-origin anchor split, which provider A cannot produce
    // from a camera 100 Mpc out (frameContext.test.ts's routing fixture).
    const basisLocal: Mat3 = [1, 0, 0, 0, 0, 1, 0, -1, 0];
    const arm: FramedCameraPose = {
      frame: { body: 'earth' },
      pose: { bodyId: 'earth', anchorLocalM: [10, 20, 30], eyeRelAnchorM: [1, 2, 3], basisLocal },
    };
    const { state, main } = mainContext(arm);
    // 2 m along the TURNED view's right: basisLocal·YAW_RIGHT's first column is
    // local +y (the unturned basis would put it on +x).
    const eyeOffsetMpc: Vec3 = [2 * SCALE_UNITS.M_TO_MPC, 0, 0];
    const v = deriveViewContext(state, main, spec({ rotation: YAW_RIGHT, eyeOffsetMpc }))!;
    const pose = v.bodyPose('earth');
    expect(pose).not.toBeNull();
    expectVec(pose!.eyeRelBodyM, [11, 24, 33], 9);
    expect(pose!.basisM).toEqual(multiply3x3(basisLocal, YAW_RIGHT));
  });
});
