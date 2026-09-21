import { describe, it, expect } from 'vitest';
import { vec4 } from 'wgpu-matrix';

import { deriveFrameContext } from '../../../../src/services/engine/frame/frameContext';
import { deriveView } from '../../../../src/services/engine/frame/deriveView';
import { cubemapCaptureFrame } from '../../../../src/services/engine/frame/cubemapCaptureFrame';
import { NEAR0 } from '../../../../src/services/engine/frame/slabs';
import { deriveSourceMasks } from '../../../../src/services/engine/frame/deriveSourceMasks';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { computeViewProj } from '../../../../src/utils/camera/computeViewProj';
import { orbitForwardOf } from '../../../../src/utils/camera/orbitForwardOf';
import { cameraBillboardBasis } from '../../../../src/utils/camera/cameraBillboardBasis';
import { assembleOrbitCamera } from '../../../../src/services/engine/camera/assembleOrbitCamera';
import { mainViewSpec } from '../../../../src/utils/camera/mainViewSpec';
import { faceViewSpec } from '../../../../src/utils/camera/faceViewSpec';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { symmetricFrustum } from '../../../../src/utils/camera/symmetricFrustum';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { multiply3x3 } from '../../../../src/utils/math/multiply3x3';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { rotXMat3 } from '../../../../src/utils/math/rotXMat3';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import { rotYMat3 } from '../../../helpers/camera/rotYMat3';
import { RENDER_ORIGIN_MPC } from '../../../../src/data/renderOrigin';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { GALAXY_CATALOG_SOURCES } from '../../../../src/data/sources';
import { galaxyCatalogIdOf } from '../../../../src/utils/galaxyCatalogIdOf';
import { CUBEMAP_CAPTURES } from '../../../../src/data/rendering/cubemapCaptures';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { ViewSpec } from '../../../../src/@types/engine/frame/ViewSpec';
import type { CaptureFrame } from '../../../../src/@types/engine/frame/CaptureFrame';
import type { ViewFrustum } from '../../../../src/@types/camera/ViewFrustum';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { CameraProjection } from '../../../../src/@types/camera/CameraProjection';
import type { FramedCameraPose } from '../../../../src/@types/camera/FramedCameraPose';
import type { CubeFace } from '../../../../src/@types/rendering/CubeFace';
import type { FadeId } from '../../../../src/@types/animation/FadeId';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
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

  it('clipYFlip negates the projected clip-Y row on the view AND every slab — a spec property, never a post-derive mutation', () => {
    // The ruling: the flip lives where every projection (the view's own vp
    // and each slab's) is BUILT, not patched onto `deriveView`'s output
    // afterward — so negating just row 1 (column-major indices 1/5/9/13)
    // must be the ONLY difference from the unflipped view, on every matrix.
    const snapshot = frame();
    const plain = deriveView(snapshot, CAM, spec());
    const flipped = deriveView(snapshot, CAM, spec({ clipYFlip: true }));
    const onlyClipYRowFlips = (a: ArrayLike<number>, b: ArrayLike<number>): void => {
      for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
          const i = col * 4 + row;
          if (row === 1) expect(b[i]).toBeCloseTo(-a[i]!, 9);
          else expect(b[i]).toBeCloseTo(a[i]!, 9);
        }
      }
    };
    onlyClipYRowFlips(plain.vp, flipped.vp);
    expect(flipped.slabs).toHaveLength(plain.slabs.length);
    for (let s = 0; s < plain.slabs.length; s++) {
      onlyClipYRowFlips(plain.slabs[s]!.vp, flipped.slabs[s]!.vp);
    }
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

// A capture face is now `deriveView(capture.snapshot, capture.cam,
// faceViewSpec(face, size, slotBase))` and nothing else (K6) — folded from
// the deleted `cubemapFaceContext.ts`'s own test file, which existed only to
// cover that composition.
describe('deriveView — a captured cube face (cubemapCaptureFrame + faceViewSpec)', () => {
  const CAPTURE_LAST_POSE: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: 0.1, distance: 50 };
  const CAPTURE_PROJECTION: CameraProjection = {
    fovYRad: 1.2,
    aspect: 16 / 9,
    near: 0.1,
    far: 10000,
  };
  const CAPTURE_LAST_SIM_DAYS = 2460000.0;
  const CAPTURE_EYE_MPC: Readonly<Vec3> = [12, -34, 56];
  // Stands in for a capture row's `nearMpc`/`viewSlotBase` (CUBEMAP_CAPTURES.sgrAStar).
  const CAPTURE_NEAR_MPC = 0.1 * SCALE_UNITS.AU_TO_MPC;
  const CAPTURE_VIEW_SLOT_BASE = 1;

  // Index order matches `CubeFace`'s doc comment: ±X, ±Y, ±Z.
  const CAPTURE_EXPECTED_AXIS: readonly Vec3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];

  /**
   * Build an `EngineState`-shaped fixture with every bootstrap-gate handle
   * populated (so `isEngineReady` passes by default) and a `cameraRuntime`
   * carrying the live projection + last-frame epoch that `cubemapCaptureFrame`
   * reads for far and `simDays`.
   */
  function makeCaptureState(
    overrides: {
      booted?: boolean;
      galaxyPointRenderer?: unknown;
      renderTargets?: unknown;
      galaxyPickRenderer?: unknown;
      compositor?: unknown;
      texturedDisks?: unknown;
    } = {},
  ): EngineState {
    const galaxyPointRenderer =
      overrides.galaxyPointRenderer === undefined ? ({} as unknown) : overrides.galaxyPointRenderer;
    const renderTargets =
      overrides.renderTargets === undefined ? ({} as unknown) : overrides.renderTargets;
    const galaxyPickRenderer =
      overrides.galaxyPickRenderer === undefined ? ({} as unknown) : overrides.galaxyPickRenderer;
    const compositor = overrides.compositor === undefined ? ({} as unknown) : overrides.compositor;
    const texturedDisks =
      overrides.texturedDisks === undefined ? ({} as unknown) : overrides.texturedDisks;

    const items = Object.fromEntries(
      GALAXY_CATALOG_SOURCES.map((s) => [
        galaxyCatalogIdOf(s),
        { enabled: true, labelEnabled: true },
      ]),
    );

    return {
      booted: overrides.booted ?? true,
      gpu: { galaxyPointRenderer, renderTargets, galaxyPickRenderer, compositor },
      subsystems: {
        texturedDisks,
        fades: { opacityOf: (id: FadeId) => (id.kind === 'galaxyCatalog' ? 0 : 0) },
      },
      settings: {
        galaxyCatalogs: { items },
        orientation: 'equatorial',
        starCatalogs: { enabled: false, items: { famousStar: { enabled: false } } },
        bodies: { items: { sun: { enabled: false }, 's-star': { enabled: false } } },
      },
      selectionRows: { hover: null, select: null, focus: null },
      data: { bodies: { earth: null, planets: [], stars: [], meshBodies: [] } },
      cameraRuntime: {
        register: { pose: CAPTURE_LAST_POSE },
        outputs: { projection: CAPTURE_PROJECTION, simDays: CAPTURE_LAST_SIM_DAYS },
      },
      picking: { pickInFlight: false, pointerDown: false, cursorTexPx: null },
    } as unknown as EngineState;
  }

  /** The row's one frame, ready-narrowed — `null` bubbles a not-ready fixture up loudly. */
  function captureFrame(
    state: EngineState,
    overrides: { nearMpc?: number; axes?: Parameters<typeof cubemapCaptureFrame>[0]['axes'] } = {},
  ): CaptureFrame | null {
    const capture = cubemapCaptureFrame({
      state,
      eyeMpc: CAPTURE_EYE_MPC,
      nearMpc: overrides.nearMpc ?? CAPTURE_NEAR_MPC,
      nowMs: 0,
      axes: overrides.axes,
    });
    return capture.isReady ? capture : null;
  }

  it('derives a FrameView with the eye at the anchor position, looking along the requested face axis', () => {
    const snapshot = captureFrame(makeCaptureState());
    expect(snapshot).not.toBeNull();
    if (snapshot === null) return;
    for (let face = 0; face < 6; face++) {
      const view = deriveView(
        snapshot.snapshot,
        snapshot.cam,
        faceViewSpec(face as CubeFace, 256, CAPTURE_VIEW_SLOT_BASE),
      );

      expect(view.drawCamPos).toEqual(CAPTURE_EYE_MPC);
      expect(view.viewSlot).toBe(CAPTURE_VIEW_SLOT_BASE + face);

      // Independent geometric check: the forward direction (target − eye,
      // read off the assembled camera, not re-derived from yaw/pitch) must
      // point exactly along this face's expected axis.
      const cam = view.cam;
      const fx = cam.target[0] - cam.position[0];
      const fy = cam.target[1] - cam.position[1];
      const fz = cam.target[2] - cam.position[2];
      const len = Math.hypot(fx, fy, fz);
      const forward: Vec3 = [fx / len, fy / len, fz / len];
      const expectedAxis = CAPTURE_EXPECTED_AXIS[face]!;
      const dot =
        forward[0] * expectedAxis[0] + forward[1] * expectedAxis[1] + forward[2] * expectedAxis[2];
      expect(dot).toBeCloseTo(1, 10);
    }
  });

  it('is not ready before bootstrap', () => {
    expect(
      cubemapCaptureFrame({
        state: makeCaptureState({ booted: false }),
        eyeMpc: CAPTURE_EYE_MPC,
        nearMpc: CAPTURE_NEAR_MPC,
        nowMs: 0,
      }).isReady,
    ).toBe(false);
    // D13: the galaxy/pick renderers are no longer part of isEngineReady's
    // gate — only the two core handles (renderTargets, compositor) block.
    expect(
      cubemapCaptureFrame({
        state: makeCaptureState({ renderTargets: null }),
        eyeMpc: CAPTURE_EYE_MPC,
        nearMpc: CAPTURE_NEAR_MPC,
        nowMs: 0,
      }).isReady,
    ).toBe(false);
    expect(
      cubemapCaptureFrame({
        state: makeCaptureState({ compositor: null }),
        eyeMpc: CAPTURE_EYE_MPC,
        nearMpc: CAPTURE_NEAR_MPC,
        nowMs: 0,
      }).isReady,
    ).toBe(false);
  });

  it('carries the draw mask, not the pick mask, as visibleSourceMask', () => {
    const state = makeCaptureState();
    const snapshot = captureFrame(state);
    expect(snapshot).not.toBeNull();
    if (snapshot === null) return;
    expect(snapshot.snapshot.visibleSourceMask).toBe(deriveSourceMasks(state, 0).draw);
  });

  it('renders a cube-axis direction to the exact (s,t) the WGSL cube sampler computes for it, under world and host axes', () => {
    // Capture↔sample identity (audit-cubemap-alignment.md): a star at world
    // direction d must land, under the face camera's vp + WebGPU's top-left
    // viewport transform, on the SAME (u,v) the GL/Vulkan/WGSL cube-face
    // table derives from d. Independently implements both sides; fails as
    // v = 1 − t if the capture's clip-Y mirror is ever dropped. One
    // direction per face, all with t well away from the flip-invariant 0.5.
    // Under a host frame the fragment samples along host-axis d, so the face
    // must capture world direction axes·d there, or the probe spins with the host.
    const state = makeCaptureState();
    const hostAxes = multiply3x3(rotXMat3(0.4), rotYMat3(1.1));
    const directions: readonly Vec3[] = [
      [0.9, 0.1, 0.3], // +X
      [-0.9, 0.2, 0.15], // −X
      [0.1, 0.8, 0.2], // +Y
      [0.2, -0.85, 0.3], // −Y
      [0.15, 0.2, 0.9], // +Z
      [0.3, 0.2, -0.93], // −Z
    ];

    for (const axes of [undefined, hostAxes]) {
      // Not CAPTURE_NEAR_MPC: at a 66 Mpc eye a rotated basis rounds its
      // sub-AU eye-to-target offset past this 5-place check.
      const snapshot = captureFrame(state, { nearMpc: 0.01, axes });
      expect(snapshot).not.toBeNull();
      if (snapshot === null) continue;

      for (const d of directions) {
        // Cube-face selection + (s,t) per the GL table 8.19 / WGSL rules.
        const [x, y, z] = d;
        const ax = Math.abs(x);
        const ay = Math.abs(y);
        const az = Math.abs(z);
        let face: number;
        let sc: number;
        let tc: number;
        let ma: number;
        if (ax >= ay && ax >= az) {
          face = x > 0 ? 0 : 1;
          ma = ax;
          sc = x > 0 ? -z : z;
          tc = -y;
        } else if (ay >= az) {
          face = y > 0 ? 2 : 3;
          ma = ay;
          sc = x;
          tc = y > 0 ? z : -z;
        } else {
          face = z > 0 ? 4 : 5;
          ma = az;
          sc = z > 0 ? x : -x;
          tc = -y;
        }
        const s = (sc / ma + 1) / 2;
        const t = (tc / ma + 1) / 2;

        const view = deriveView(
          snapshot.snapshot,
          snapshot.cam,
          faceViewSpec(face as CubeFace, 256, CAPTURE_VIEW_SLOT_BASE),
        );

        const w = rotateVec3ByTightMat3(d as Vec3, axes);
        // World point 1 Mpc out along axes·d, through the face's cosmo vp
        // (column-major, clip = vp · [p, 1]).
        const p: Vec3 = [
          CAPTURE_EYE_MPC[0] + w[0],
          CAPTURE_EYE_MPC[1] + w[1],
          CAPTURE_EYE_MPC[2] + w[2],
        ];
        const vp = view.vp;
        const cx = vp[0]! * p[0] + vp[4]! * p[1] + vp[8]! * p[2] + vp[12]!;
        const cy = vp[1]! * p[0] + vp[5]! * p[1] + vp[9]! * p[2] + vp[13]!;
        const cw = vp[3]! * p[0] + vp[7]! * p[1] + vp[11]! * p[2] + vp[15]!;
        // WebGPU viewport transform: top-left origin, y down.
        const u = (cx / cw + 1) / 2;
        const v = (1 - cy / cw) / 2;

        expect(u).toBeCloseTo(s, 5);
        expect(v).toBeCloseTo(t, 5);
      }
    }
  });

  it("clips well below the S-star scale, not the live cosmo camera's 10-kpc near plane", () => {
    // The capture's actual content (S-stars, the field around Sgr A*) sits
    // at hundreds of AU — reusing the live projection's near (0.01 Mpc /
    // 10 kpc, CAPTURE_PROJECTION above) would clip it all invisible, so the
    // given `nearMpc` has to reach the camera rather than the live one.
    const snapshot = captureFrame(makeCaptureState());
    expect(snapshot).not.toBeNull();
    if (snapshot === null) return;
    const view = deriveView(
      snapshot.snapshot,
      snapshot.cam,
      faceViewSpec(0, 256, CAPTURE_VIEW_SLOT_BASE),
    );
    expect(view.cam.near).toBe(CAPTURE_NEAR_MPC);
  });

  it("places the synthetic orbit distance at the row's near plane, under the foreground gate", () => {
    // Body passes gate on `ctx.cam.distance` against the foreground reach, so
    // a capture posed 1 Mpc out would draw a face with no body in it.
    const snapshot = captureFrame(makeCaptureState());
    expect(snapshot).not.toBeNull();
    if (snapshot === null) return;
    const view = deriveView(
      snapshot.snapshot,
      snapshot.cam,
      faceViewSpec(0, 256, CAPTURE_VIEW_SLOT_BASE),
    );
    expect(view.cam.distance).toBe(CAPTURE_NEAR_MPC);
  });

  it("a capture face's altitude ignores the real focus pivot radius", () => {
    // NEAR0's bracket is sized from the eye-to-pivot-surface range; for the
    // real camera that is the pose distance minus the focus's radius. A face's
    // pose is synthetic and orbits no pivot: with a rover on Mars focused, the
    // subtraction would drive a metre-scale probe altitude hugely negative.
    const faceAt = (focus: unknown) => {
      const state = makeCaptureState();
      (state as unknown as { selectionRows: { focus: unknown } }).selectionRows.focus = focus;
      const snapshot = captureFrame(state);
      return snapshot === null
        ? null
        : deriveView(snapshot.snapshot, snapshot.cam, faceViewSpec(0, 256, CAPTURE_VIEW_SLOT_BASE));
    };
    // A star half the capture distance across: the subtraction, if applied,
    // halves the altitude and with it the bracket.
    const halfWayStar = {
      type: 'star',
      index: 0,
      positionMpc: [0, 0, 0],
      absMag: 0,
      bpRp: 0,
      radiusM: 0.05 * SCALE_UNITS.AU_TO_MPC * SCALE_UNITS.MPC_TO_M,
    };
    const focused = faceAt(halfWayStar);
    const unfocused = faceAt(null);
    expect(focused).not.toBeNull();
    expect(unfocused).not.toBeNull();
    if (focused === null || unfocused === null) return;
    expect(focused.slabs[0]!.near).toBe(unfocused.slabs[0]!.near);
    expect(focused.slabs[0]!.far).toBe(unfocused.slabs[0]!.far);
  });

  it("aims a metre-near probe face exactly along its axis at Voyager's eye", () => {
    // Voyager's eye (~1e-7 Mpc) has an f64 ULP within a few orders of 1 m, so a
    // forward recovered as target − eye over the 1 m probe near is skewed by
    // rounding (to zero, NaN vp, further out). In the host's own frame the
    // face's forward is the bare cube axis.
    const bodyStates = deriveBodyStates(CAPTURE_LAST_SIM_DAYS);
    const voyager = bodyStates.get('voyager1')!;
    const snapshot = cubemapCaptureFrame({
      state: makeCaptureState(),
      eyeMpc: voyager.positionMpc,
      nearMpc: CUBEMAP_CAPTURES.probe.nearMpc,
      nowMs: 0,
      axes: voyager.orientation,
    });
    expect(snapshot.isReady).toBe(true);
    if (!snapshot.isReady) return;
    const view = deriveView(
      snapshot.snapshot,
      snapshot.cam,
      faceViewSpec(4, 256, CAPTURE_VIEW_SLOT_BASE),
    );
    expect(Array.from(view.vp).every(Number.isFinite)).toBe(true);
    expect(Array.from(view.slabs[0]!.vp).every(Number.isFinite)).toBe(true);
    const { basisM } = view.bodyPose('voyager1' as BodyId)!;
    expect(basisM[6]).toBeCloseTo(0, 9);
    expect(basisM[7]).toBeCloseTo(0, 9);
    expect(basisM[8]).toBeCloseTo(1, 9);
  });

  it("stamps viewSlot from the given base, so a second capture cannot share the first's slots", () => {
    const snapshot = captureFrame(makeCaptureState());
    expect(snapshot).not.toBeNull();
    if (snapshot === null) return;
    const view = deriveView(snapshot.snapshot, snapshot.cam, faceViewSpec(2, 256, 7));
    expect(view.viewSlot).toBe(9);
  });

  it("each face's vp and cam.poseBasis match the pre-split values", () => {
    // Captured from this branch's HEAD before the split, through the SAME
    // fixture and today's `computeViewProj`/`assembleOrbitCamera` (unchanged
    // by the split) fed the old per-face `FACE_BASES` basis directly, then
    // `flipClipY`. Element-wise `toBe` on every nonzero element — the guard
    // that `FACE_VIEW_ROTATIONS` reproduces the old per-face basis exactly,
    // AND (post-K6) that `clipYFlip` applied at the projection builder lands
    // on the SAME numbers the old post-derive `flipClipY` mutation did.
    // Ruling: a handful of elements land at `0` vs `-0`
    // (a harmless term-order artefact, not a value drift, per the Task 3
    // review's identical finding on the canvas view) — `toBe` cannot tell a
    // captured `-0` from `0` at the literal, so every ZERO-valued element
    // uses `toBeCloseTo(0, 12)` instead, which is sign-blind; any real
    // regression still fails it the moment the value is no longer ~0.
    const VP: readonly (readonly number[])[] = [
      [0, 0, 1, 1, 0, 1, 0, 0, -1, 0, 0, 0, 56, 34, -12, -12],
      [0, 0, -1, -1, 0, 1, 0, 0, 1, 0, 0, 0, -56, 34, 12, 12],
      [1, 0, 0, 0, 0, 0, 1, 1, 0, -1, 0, 0, -12, 56, 34, 34],
      [1, 0, 0, 0, 0, 0, -1, -1, 0, 1, 0, 0, -12, -56, -34, -34],
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, -12, 34, -56, -56],
      [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, -1, 12, 34, 56, 56],
    ];
    const POSE_BASIS: readonly (readonly number[])[] = [
      [0, 0, -1, 0, -1, 0, -1, 0, 0],
      [0, 0, 1, 0, -1, 0, 1, 0, 0],
      [1, 0, 0, 0, 0, 1, 0, -1, 0],
      [1, 0, 0, 0, 0, -1, 0, 1, 0],
      [1, 0, 0, 0, -1, 0, 0, 0, -1],
      [-1, 0, 0, 0, -1, 0, 0, 0, 1],
    ];
    const pin = (actual: number, expected: number): void => {
      if (expected === 0) expect(actual).toBeCloseTo(0, 12);
      else expect(actual).toBe(expected);
    };

    const snapshot = captureFrame(makeCaptureState());
    expect(snapshot).not.toBeNull();
    if (snapshot === null) return;
    for (let face = 0; face < 6; face++) {
      const view = deriveView(
        snapshot.snapshot,
        snapshot.cam,
        faceViewSpec(face as CubeFace, 256, CAPTURE_VIEW_SLOT_BASE),
      );
      for (let i = 0; i < 16; i++) pin(view.vp[i]!, VP[face]![i]!);
      for (let i = 0; i < 9; i++) pin(view.cam.poseBasis![i]!, POSE_BASIS[face]![i]!);
    }
  });
});
