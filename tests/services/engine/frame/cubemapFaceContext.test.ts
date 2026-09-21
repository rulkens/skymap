/**
 * cubemapFaceContext — unit tests for a cubemap capture's per-face camera.
 * `cubemapCaptureFrame` derives the row's ONE frame; these turn it six ways.
 *
 * Mirrors `pickFrameContext.test.ts`'s fixture shape (same bootstrap-gate
 * handles, same `settings`/`subsystems` shape `deriveSourceMasks` reads) —
 * see that file's header for why each field is there.
 */

import { describe, it, expect } from 'vitest';

import { cubemapCaptureFrame } from '../../../../src/services/engine/frame/cubemapCaptureFrame';
import { cubemapFaceContext } from '../../../../src/services/engine/frame/cubemapFaceContext';
import { deriveSourceMasks } from '../../../../src/services/engine/frame/deriveSourceMasks';
import { GALAXY_CATALOG_SOURCES } from '../../../../src/data/sources';
import { galaxyCatalogIdOf } from '../../../../src/utils/galaxyCatalogIdOf';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CUBEMAP_CAPTURES } from '../../../../src/data/rendering/cubemapCaptures';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { multiply3x3 } from '../../../../src/utils/math/multiply3x3';
import { rotXMat3 } from '../../../../src/utils/math/rotXMat3';
import { rotYMat3 } from '../../../helpers/camera/rotYMat3';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { CameraProjection } from '../../../../src/@types/camera/CameraProjection';
import type { CubeFace } from '../../../../src/@types/rendering/CubeFace';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { FadeId } from '../../../../src/@types/animation/FadeId';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';

const LAST_POSE: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: 0.1, distance: 50 };
const PROJECTION: CameraProjection = { fovYRad: 1.2, aspect: 16 / 9, near: 0.1, far: 10000 };
const LAST_SIM_DAYS = 2460000.0;
const EYE_MPC: Readonly<Vec3> = [12, -34, 56];
// Stands in for a capture row's `nearMpc`/`viewSlotBase` (CUBEMAP_CAPTURES.sgrAStar).
const CAPTURE_NEAR_MPC = 0.1 * SCALE_UNITS.AU_TO_MPC;
const VIEW_SLOT_BASE = 1;

// Index order matches `CubeFace`'s doc comment: ±X, ±Y, ±Z.
const EXPECTED_AXIS: readonly Vec3[] = [
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
function makeState(
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
      register: { pose: LAST_POSE },
      outputs: { projection: PROJECTION, simDays: LAST_SIM_DAYS },
    },
    picking: { pickInFlight: false, pointerDown: false, cursorTexPx: null },
  } as unknown as EngineState;
}

/** The row's one frame, ready-narrowed — `null` bubbles a not-ready fixture up loudly. */
function captureFrame(
  state: EngineState,
  overrides: { nearMpc?: number; axes?: Parameters<typeof cubemapCaptureFrame>[0]['axes'] } = {},
): ReadyFrameContext | null {
  const snapshot = cubemapCaptureFrame({
    state,
    eyeMpc: EYE_MPC,
    nearMpc: overrides.nearMpc ?? CAPTURE_NEAR_MPC,
    nowMs: 0,
    axes: overrides.axes,
  });
  return snapshot.isReady ? snapshot : null;
}

describe('cubemapFaceContext', () => {
  it('derives a FrameView with the eye at the anchor position, looking along the requested face axis', () => {
    const snapshot = captureFrame(makeState());
    expect(snapshot).not.toBeNull();
    if (snapshot === null) return;
    for (let face = 0; face < 6; face++) {
      const view = cubemapFaceContext(snapshot, face as CubeFace, 256, VIEW_SLOT_BASE);

      expect(view.drawCamPos).toEqual(EYE_MPC);
      expect(view.viewSlot).toBe(VIEW_SLOT_BASE + face);

      // Independent geometric check: the forward direction (target − eye,
      // read off the assembled camera, not re-derived from yaw/pitch) must
      // point exactly along this face's expected axis.
      const cam = view.cam;
      const fx = cam.target[0] - cam.position[0];
      const fy = cam.target[1] - cam.position[1];
      const fz = cam.target[2] - cam.position[2];
      const len = Math.hypot(fx, fy, fz);
      const forward: Vec3 = [fx / len, fy / len, fz / len];
      const expectedAxis = EXPECTED_AXIS[face]!;
      const dot =
        forward[0] * expectedAxis[0] + forward[1] * expectedAxis[1] + forward[2] * expectedAxis[2];
      expect(dot).toBeCloseTo(1, 10);
    }
  });

  it('is not ready before bootstrap', () => {
    expect(
      cubemapCaptureFrame({
        state: makeState({ booted: false }),
        eyeMpc: EYE_MPC,
        nearMpc: CAPTURE_NEAR_MPC,
        nowMs: 0,
      }).isReady,
    ).toBe(false);
    // D13: the galaxy/pick renderers are no longer part of isEngineReady's
    // gate — only the two core handles (renderTargets, compositor) block.
    expect(
      cubemapCaptureFrame({
        state: makeState({ renderTargets: null }),
        eyeMpc: EYE_MPC,
        nearMpc: CAPTURE_NEAR_MPC,
        nowMs: 0,
      }).isReady,
    ).toBe(false);
    expect(
      cubemapCaptureFrame({
        state: makeState({ compositor: null }),
        eyeMpc: EYE_MPC,
        nearMpc: CAPTURE_NEAR_MPC,
        nowMs: 0,
      }).isReady,
    ).toBe(false);
  });

  it('carries the draw mask, not the pick mask, as visibleSourceMask', () => {
    const state = makeState();
    const snapshot = captureFrame(state);
    expect(snapshot).not.toBeNull();
    if (snapshot === null) return;
    expect(snapshot.visibleSourceMask).toBe(deriveSourceMasks(state, 0).draw);
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
    const state = makeState();
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

        const view = cubemapFaceContext(snapshot, face as CubeFace, 256, VIEW_SLOT_BASE);

        const w = rotateVec3ByTightMat3(d as Vec3, axes);
        // World point 1 Mpc out along axes·d, through the face's cosmo vp
        // (column-major, clip = vp · [p, 1]).
        const p: Vec3 = [EYE_MPC[0] + w[0], EYE_MPC[1] + w[1], EYE_MPC[2] + w[2]];
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
    // 10 kpc, PROJECTION above) would clip it all invisible, so the given
    // `nearMpc` has to reach the camera rather than the live one.
    const snapshot = captureFrame(makeState());
    expect(snapshot).not.toBeNull();
    if (snapshot === null) return;
    const view = cubemapFaceContext(snapshot, 0, 256, VIEW_SLOT_BASE);
    expect(view.cam.near).toBe(CAPTURE_NEAR_MPC);
  });

  it("places the synthetic orbit distance at the row's near plane, under the foreground gate", () => {
    // Body passes gate on `ctx.cam.distance` against the foreground reach, so
    // a capture posed 1 Mpc out would draw a face with no body in it.
    const snapshot = captureFrame(makeState());
    expect(snapshot).not.toBeNull();
    if (snapshot === null) return;
    const view = cubemapFaceContext(snapshot, 0, 256, VIEW_SLOT_BASE);
    expect(view.cam.distance).toBe(CAPTURE_NEAR_MPC);
  });

  it("a capture face's altitude ignores the real focus pivot radius", () => {
    // NEAR0's bracket is sized from the eye-to-pivot-surface range; for the
    // real camera that is the pose distance minus the focus's radius. A face's
    // pose is synthetic and orbits no pivot: with a rover on Mars focused, the
    // subtraction would drive a metre-scale probe altitude hugely negative.
    const faceAt = (focus: unknown) => {
      const state = makeState();
      (state as unknown as { selectionRows: { focus: unknown } }).selectionRows.focus = focus;
      const snapshot = captureFrame(state);
      return snapshot === null ? null : cubemapFaceContext(snapshot, 0, 256, VIEW_SLOT_BASE);
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
    const bodyStates = deriveBodyStates(LAST_SIM_DAYS);
    const voyager = bodyStates.get('voyager1')!;
    const snapshot = cubemapCaptureFrame({
      state: makeState(),
      eyeMpc: voyager.positionMpc,
      nearMpc: CUBEMAP_CAPTURES.probe.nearMpc,
      nowMs: 0,
      axes: voyager.orientation,
    });
    expect(snapshot.isReady).toBe(true);
    if (!snapshot.isReady) return;
    const view = cubemapFaceContext(snapshot, 4, 256, VIEW_SLOT_BASE);
    expect(Array.from(view.vp).every(Number.isFinite)).toBe(true);
    expect(Array.from(view.slabs[0]!.vp).every(Number.isFinite)).toBe(true);
    const { basisM } = view.bodyPose('voyager1' as BodyId)!;
    expect(basisM[6]).toBeCloseTo(0, 9);
    expect(basisM[7]).toBeCloseTo(0, 9);
    expect(basisM[8]).toBeCloseTo(1, 9);
  });

  it("stamps viewSlot from the given base, so a second capture cannot share the first's slots", () => {
    const snapshot = captureFrame(makeState());
    expect(snapshot).not.toBeNull();
    if (snapshot === null) return;
    const view = cubemapFaceContext(snapshot, 2, 256, 7);
    expect(view.viewSlot).toBe(9);
  });

  it("each face's vp and cam.poseBasis match the pre-split values", () => {
    // Captured from this branch's HEAD before the split, through the SAME
    // fixture and today's `computeViewProj`/`assembleOrbitCamera` (unchanged
    // by the split) fed the old per-face `FACE_BASES` basis directly, then
    // `flipClipY`. Element-wise `toBe` on every nonzero element — the guard
    // that Task 2's `FACE_VIEW_ROTATIONS` table reproduces the old per-face
    // basis exactly. Ruling: a handful of elements land at `0` vs `-0`
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

    const snapshot = captureFrame(makeState());
    expect(snapshot).not.toBeNull();
    if (snapshot === null) return;
    for (let face = 0; face < 6; face++) {
      const view = cubemapFaceContext(snapshot, face as CubeFace, 256, VIEW_SLOT_BASE);
      for (let i = 0; i < 16; i++) pin(view.vp[i]!, VP[face]![i]!);
      for (let i = 0; i < 9; i++) pin(view.cam.poseBasis![i]!, POSE_BASIS[face]![i]!);
    }
  });
});
