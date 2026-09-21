import { describe, it, expect } from 'vitest';
import { vec4 } from 'wgpu-matrix';

import { deriveFrameContext } from '../../../../src/services/engine/frame/frameContext';
import { deriveView } from '../../../../src/services/engine/frame/deriveView';
import { NEAR0 } from '../../../../src/services/engine/frame/slabs';
import { computeViewProj } from '../../../../src/utils/camera/computeViewProj';
import { orbitForwardOf } from '../../../../src/utils/camera/orbitForwardOf';
import { cameraBillboardBasis } from '../../../../src/utils/camera/cameraBillboardBasis';
import { assembleOrbitCamera } from '../../../../src/services/engine/camera/assembleOrbitCamera';
import { mainViewSpec } from '../../../../src/utils/camera/mainViewSpec';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { symmetricFrustum } from '../../../../src/utils/camera/symmetricFrustum';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { multiply3x3 } from '../../../../src/utils/math/multiply3x3';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { RENDER_ORIGIN_MPC } from '../../../../src/data/renderOrigin';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { ViewSpec } from '../../../../src/@types/engine/frame/ViewSpec';
import type { ViewFrustum } from '../../../../src/@types/camera/ViewFrustum';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { CameraProjection } from '../../../../src/@types/camera/CameraProjection';
import type { FramedCameraPose } from '../../../../src/@types/camera/FramedCameraPose';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { Size } from '../../../../src/@types/rendering/Size';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// Roll and a rotated orientation basis keep every lookAt element off ±0, so the
// pin below compares real values rather than the sign of a zero.
const POSE: CameraPose = { target: [1, 2, 3], yaw: 0.3, pitch: 0.1, distance: 100, roll: 0.2 };
const PROJECTION: CameraProjection = { fovYRad: 1, aspect: 16 / 9, near: 0.1, far: 10000 };
const CANVAS: Size = { width: 1920, height: 1080 };
const C = Math.cos(0.4);
const S = Math.sin(0.4);
const BASIS: Mat3 = [C, 0, -S, 0, 1, 0, S, 0, C];
// Columns are the view's right | up | forward in camera image-plane coordinates.
const YAW_RIGHT: Mat3 = [0, 0, -1, 0, 1, 0, 1, 0, 0];
const YAW_LEFT: Mat3 = [0, 0, 1, 0, 1, 0, -1, 0, 0];
const BACK: Mat3 = [-1, 0, 0, 0, 1, 0, 0, 0, -1];
const UP: Mat3 = [1, 0, 0, 0, 0, -1, 0, 1, 0];
// The frame's pose-true camera: a pure function of the constants above, so
// every fixture below can pass this SAME value rather than reading it off
// `snapshot.cam`, which K2 removed.
const CAM = assembleOrbitCamera(POSE, PROJECTION, BASIS, BASIS);

function makeState(): EngineState {
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
  } as unknown as EngineState;
}

function frame(arm: FramedCameraPose = absoluteArm(POSE)): ReadyFrameContext {
  const ctx = deriveFrameContext(makeState(), {
    cam: CAM,
    arm,
    // No focused pivot in this fixture, so `pivotSurfaceRangeMpc` answers the
    // raw orbit distance — what `runFrame` would pass for this pose.
    altitudeMpc: POSE.distance,
    nowMs: 0,
    simDays: CONST_J2000,
    visibleSourceMask: 0,
  });
  if (!ctx.isReady) throw new Error('fixture not ready');
  return ctx;
}

function spec(overrides: Partial<ViewSpec> = {}): ViewSpec {
  return {
    rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    eyeOffsetMpc: [0, 0, 0],
    frustum: symmetricFrustum(PROJECTION.fovYRad, PROJECTION.aspect),
    sizePx: CANVAS,
    slot: 0,
    kind: 'frame',
    ...overrides,
  };
}

/** A turned view beside the canvas view of the SAME frame, to compare against. */
function view(overrides: Partial<ViewSpec> = {}): { canvas: FrameView; v: FrameView } {
  const snapshot = frame();
  return {
    canvas: deriveView(snapshot, CAM, mainViewSpec(CAM, CANVAS)),
    v: deriveView(snapshot, CAM, spec(overrides)),
  };
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

describe('deriveView', () => {
  it("a 90° yaw rotation turns the view's forward to the camera's right", () => {
    const { canvas, v } = view({ rotation: YAW_RIGHT });
    expectVec(basisOf(v.vp).forward, basisOf(canvas.vp).right);
    expectVec(basisOf(v.vp).up, basisOf(canvas.vp).up);
  });

  it("a turned view's ctx.cam is that view's camera, so every ctx.cam reader draws it", () => {
    const { canvas, v } = view({ rotation: YAW_RIGHT, eyeOffsetMpc: [0.5, 0, 0] });
    const want = basisOf(v.vp);
    expectVec(orbitForwardOf(v.cam), want.forward);
    expectVec(basisOf(canvas.vp).right, want.forward);
    // The billboard axes the Milky Way passes read, and the shells' target − eye.
    const billboard = cameraBillboardBasis(v.cam);
    expectVec(billboard.right, want.right);
    expectVec(billboard.up, want.up);
    const aim = [0, 1, 2].map((i) => v.cam.target[i]! - v.cam.position[i]!) as Vec3;
    expectVec(normalize3(aim), want.forward);
    const camVp = computeViewProj(v.cam, spec().frustum);
    for (let i = 0; i < 16; i++) expect(camVp[i]).toBeCloseTo(v.vp[i]!, 4);
  });

  it('five dome-like specs derive five distinct vps from one frame', () => {
    const snapshot = frame();
    const cam = basisOf(deriveView(snapshot, CAM, mainViewSpec(CAM, CANVAS)).vp);
    const camBasis: Mat3 = [...cam.right, ...cam.up, ...cam.forward];
    const faces = [[1, 0, 0, 0, 1, 0, 0, 0, 1] as Mat3, YAW_LEFT, YAW_RIGHT, BACK, UP].map(
      (rotation, slot) => {
        const face = deriveView(
          snapshot,
          CAM,
          spec({
            rotation,
            frustum: symmetricFrustum(Math.PI / 2, 1),
            sizePx: { width: 512, height: 512 },
            slot,
          }),
        );
        expect(face.viewSlot).toBe(slot);
        const want = multiply3x3(camBasis, rotation);
        expectVec(basisOf(face.vp).forward, [want[6], want[7], want[8]]);
        return Array.from(face.vp);
      },
    );
    for (let a = 0; a < faces.length; a++) {
      for (let b = a + 1; b < faces.length; b++) expect(faces[a]).not.toEqual(faces[b]);
    }
  });

  it('an asymmetric frustum survives into view.vp and drawPxPerRad', () => {
    const frustum: ViewFrustum = { tanLeft: -0.3, tanRight: 0.9, tanDown: -0.5, tanUp: 0.4 };
    const { canvas, v } = view({ frustum, sizePx: { width: 800, height: 600 } });
    // Each frustum edge, one unit deep along the camera's own axes, lands on NDC ±1.
    const { right, up, forward } = basisOf(canvas.vp);
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

  it("an eye offset moves drawCamPos by the rotated offset and leaves the frame's pose untouched", () => {
    // Half a unit along the turned view's right, which is the camera's back.
    const { canvas, v } = view({ rotation: YAW_RIGHT, eyeOffsetMpc: [0.5, 0, 0] });
    expect(v.cam.position).toEqual(v.drawCamPos);
    expect(v.cam.distance).toBe(CAM.distance);
    expect(CAM.position).toEqual(canvas.drawCamPos);
    const back = basisOf(canvas.vp).forward.map((x) => -0.5 * x) as Vec3;
    expectVec([0, 1, 2].map((i) => v.drawCamPos[i]! - canvas.drawCamPos[i]!) as Vec3, back);
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
    // 2 m along the TURNED view's right: basisLocal·YAW_RIGHT's first column is
    // local +y (the unturned basis would put it on +x).
    const eyeOffsetMpc: Vec3 = [2 * SCALE_UNITS.M_TO_MPC, 0, 0];
    const v = deriveView(frame(arm), CAM, spec({ rotation: YAW_RIGHT, eyeOffsetMpc }));
    const pose = v.bodyPose('earth');
    expect(pose).not.toBeNull();
    expectVec(pose!.eyeRelBodyM, [11, 24, 33], 9);
    expect(pose!.basisM).toEqual(multiply3x3(basisLocal, YAW_RIGHT));
  });

  it('two views of one frame share the snapshot by reference', () => {
    const snapshot = frame();
    const a = deriveView(snapshot, CAM, mainViewSpec(CAM, CANVAS));
    const b = deriveView(snapshot, CAM, spec({ rotation: YAW_RIGHT, slot: 1 }));
    // Reference equality, not value: a copied context would drift the moment
    // `runFrame` stamps focus on one of them, and the clock and body sample
    // would stop being one thing.
    expect(a.snapshot).toBe(snapshot);
    expect(b.snapshot).toBe(a.snapshot);
    expect(b.snapshot.bodyStates).toBe(a.snapshot.bodyStates);
    expect(b.snapshot.nowMs).toBe(a.snapshot.nowMs);
  });

  it('the frame camera is unreachable off snapshot — it travels only as deriveView’s own argument (K2)', () => {
    const { v } = view();
    // @ts-expect-error — ReadyFrameContext carries no `cam`; a pass wanting the
    // pose-true camera has no field to reach for besides the view's own `cam`.
    expect(v.snapshot.cam).toBeUndefined();
  });

  it('each view keeps its own first-touch set', () => {
    const snapshot = frame();
    const a = deriveView(snapshot, CAM, mainViewSpec(CAM, CANVAS));
    const b = deriveView(snapshot, CAM, spec({ rotation: YAW_RIGHT, slot: 1 }));
    expect(a.renderedTargets).not.toBe(b.renderedTargets);
    // The executor's first touch of `hdr` in view A must still CLEAR in view B.
    (a.renderedTargets as Set<string>).add('hdr');
    expect(b.renderedTargets.has('hdr')).toBe(false);
  });
});

describe('deriveView — the canvas view is the pre-split one', () => {
  // Captured from this branch's HEAD before the split, through the SAME fixture
  // and today's `deriveFrameContext` with no view spec. Element-wise `toBe`:
  // the ruling was that the canvas view goes through `turnedOrbitCamera` like
  // every other view BECAUSE an identity turn and a zero offset are exact, and
  // this is the only guard that the ruling held.
  const VP = [
    0.7586652040481567, -0.39352402091026306, -0.6410056948661804, -0.6409992575645447,
    0.20353782176971436, 1.7850372791290283, -0.09983441233634949, -0.0998334139585495,
    -0.6657156348228455, 0.09729325771331787, -0.7610287666320801, -0.7610211372375488,
    0.8314024209976196, -3.46842885017395, 103.0247573852539, 103.12372589111328,
  ];
  const DRAW_CAM_POS = [65.0999282147279, 11.983341664682815, 79.10211621284218];
  const NEAR0_VP = [
    0.75866515407635, -0.39352398195397276, 0, -0.6409992821472812, 0.20353779933753682,
    1.7850373105212385, 0, -0.09983341664682821, -0.6657156440444009, 0.09729324238731396, 0,
    -0.7610211621284202, 0.8314061793820496, -3.4684303662505402, 0.01, 103.1237296018262,
  ];

  it('the canvas view’s vp, drawCamPos and slab vps are bit-identical to the pre-split values', () => {
    const snapshot = frame();
    const canvas = deriveView(snapshot, CAM, mainViewSpec(CAM, CANVAS));
    for (let i = 0; i < 16; i++) expect(canvas.vp[i]).toBe(VP[i]);
    for (let i = 0; i < 3; i++) expect(canvas.drawCamPos[i]).toBe(DRAW_CAM_POS[i]);
    expect(canvas.slabs).toHaveLength(2);
    for (let i = 0; i < 16; i++) expect(canvas.slabs[0]!.vp[i]).toBe(NEAR0_VP[i]);
    for (let i = 0; i < 16; i++) expect(canvas.slabs[1]!.vp[i]).toBe(VP[i]);
    expect(canvas.drawPxPerRad).toBe(988.4633697247241);
  });
});
