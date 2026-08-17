/**
 * frameContext — unit tests for the per-frame derived snapshot.
 *
 * `deriveFrameContext` receives an already-produced `CameraPose`, a
 * `CameraProjection`, and the frame's two orientation bases (`poseBasis`,
 * `upBasis` — the engine Resources), assembles the full `OrbitCamera` via
 * `assembleOrbitCamera`, and pre-computes the view-projection matrix,
 * camera-position tuple, and pixel-per-radian scalar. These tests pin both
 * halves: the branching shape (ready vs not-ready) and the arithmetic. They
 * use the SAME value for both basis arguments (`BASIS`) throughout — this
 * file exercises the assembly arithmetic, not the poseBasis/upBasis split
 * itself, which `runFrame.test.ts`'s orientation-frame-roll suite covers.
 *
 * The threaded-pose variant (binding decision 1) means `deriveFrameContext`
 * does NOT re-call `runCameraDrivers` internally; it only calls
 * `assembleOrbitCamera(pose, projection, poseBasis, upBasis)` +
 * `computeViewProj`. The `cam` on the ready context is the assembled camera,
 * NOT `state.cam`.
 *
 * Tests also verify the bootstrap gate still works (cam=null → not-ready) even
 * though the rendered camera comes from the assembled pose, not `state.cam`.
 */

import { describe, it, expect } from 'vitest';

import { deriveFrameContext } from '../../../../src/services/engine/frame/frameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { CameraProjection } from '../../../../src/@types/camera/CameraProjection';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import { assembleOrbitCamera } from '../../../../src/services/engine/camera/assembleOrbitCamera';
import { computeViewProj } from '../../../../src/utils/camera/computeViewProj';
import { deriveSlabs, NEAR0, COSMO } from '../../../../src/services/engine/frame/slabs';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';

const RESTING_POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 };
const PROJECTION: CameraProjection = { fovYRad: 1, aspect: 16 / 9, near: 0.1, far: 10000 };

// Identity basis: the frame-local decode is already world space, so every case
// below reproduces the pre-feature (basis-free) geometry exactly.
const BASIS: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * Build an `EngineState`-shaped fixture with the guard fields
 * (`cam`, `gpu.pointRenderer`, `gpu.renderTargets`, `gpu.pickRenderer`,
 * `gpu.compositor`, `subsystems.texturedDisks`) populated by default.
 * Each test can null any one to exercise the not-ready branch.
 *
 * `state.cam` is only used by the `isEngineReady` bootstrap gate (non-null
 * check); the rendered camera comes from
 * `assembleOrbitCamera(pose, projection, poseBasis, upBasis)` passed as
 * arguments.
 */
function makeState(
  overrides: {
    cam?: OrbitCamera | null;
    pointRenderer?: unknown;
    renderTargets?: unknown;
    pickRenderer?: unknown;
    compositor?: unknown;
    texturedDisks?: unknown;
  } = {},
): EngineState {
  const cam =
    overrides.cam === undefined
      ? ({
          target: [0, 0, 0],
          yaw: 0,
          pitch: 0,
          distance: 100,
          position: new Float32Array(3),
        } as unknown as OrbitCamera)
      : overrides.cam;
  const pointRenderer =
    overrides.pointRenderer === undefined ? ({} as unknown) : overrides.pointRenderer;
  const renderTargets =
    overrides.renderTargets === undefined ? ({} as unknown) : overrides.renderTargets;
  const pickRenderer =
    overrides.pickRenderer === undefined ? ({} as unknown) : overrides.pickRenderer;
  const compositor = overrides.compositor === undefined ? ({} as unknown) : overrides.compositor;
  const texturedDisks =
    overrides.texturedDisks === undefined ? ({} as unknown) : overrides.texturedDisks;
  return {
    cam,
    gpu: { pointRenderer, renderTargets, pickRenderer, compositor },
    subsystems: { texturedDisks },
  } as unknown as EngineState;
}

function makeCanvas(width = 1920, height = 1080): HTMLCanvasElement {
  return { width, height } as unknown as HTMLCanvasElement;
}

describe('deriveFrameContext — not-ready branch', () => {
  it('returns isReady:false when state.cam is null', () => {
    const ctx = deriveFrameContext(
      makeState({ cam: null }),
      makeCanvas(),
      RESTING_POSE,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(false);
  });

  it('returns isReady:false when gpu.pointRenderer is null', () => {
    const ctx = deriveFrameContext(
      makeState({ pointRenderer: null }),
      makeCanvas(),
      RESTING_POSE,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(false);
  });

  it('returns isReady:false when gpu.renderTargets is null', () => {
    const ctx = deriveFrameContext(
      makeState({ renderTargets: null }),
      makeCanvas(),
      RESTING_POSE,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(false);
  });

  it('returns isReady:false when subsystems.texturedDisks is null', () => {
    const ctx = deriveFrameContext(
      makeState({ texturedDisks: null }),
      makeCanvas(),
      RESTING_POSE,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(false);
  });
});

describe('deriveFrameContext — ready branch', () => {
  it('assembles ctx.cam from pose + projection (not from state.cam)', () => {
    const pose: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: 0.1, distance: 50 };
    const projection: CameraProjection = { fovYRad: 1.2, aspect: 2, near: 0.01, far: 5000 };
    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(),
      pose,
      projection,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    // ctx.cam must reflect the pose and projection.
    expect(ctx.cam.fovYRad).toBe(1.2);
    expect(ctx.cam.aspect).toBe(2);
    expect(ctx.cam.distance).toBe(50);
    expect(ctx.cam.yaw).toBeCloseTo(0.5);
    expect(ctx.cam.pitch).toBeCloseTo(0.1);
  });

  it('ctx.cam.fovYRad === projection.fovYRad (not from state.cam.fovYRad)', () => {
    // The projection Resource is the source of fovYRad; state.cam.fovYRad is
    // only the drag register bootstrap value and is never read for rendering.
    const projection: CameraProjection = { fovYRad: 0.9, aspect: 1, near: 0.1, far: 1000 };
    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(),
      RESTING_POSE,
      projection,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.cam.fovYRad).toBe(0.9);
  });

  it('drawPxPerRad uses projection.fovYRad', () => {
    const projection: CameraProjection = { fovYRad: 1, aspect: 16 / 9, near: 0.1, far: 10000 };
    const canvas = makeCanvas(1920, 1080);
    const ctx = deriveFrameContext(
      makeState(),
      canvas,
      RESTING_POSE,
      projection,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    // pxPerRad = height / (2 * tan(fovY / 2))
    const expected = 1080 / (2 * Math.tan(0.5));
    expect(ctx.drawPxPerRad).toBeCloseTo(expected, 6);
  });

  it('ctx.vp matches computeViewProj(assembleOrbitCamera(pose, projection, poseBasis, upBasis))', () => {
    const pose: CameraPose = { target: [0, 0, 0], yaw: 0.3, pitch: 0.1, distance: 100 };
    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(),
      pose,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    const expected = computeViewProj(assembleOrbitCamera(pose, PROJECTION, BASIS, BASIS));
    expect(Array.from(ctx.vp)).toEqual(Array.from(expected));
  });

  it('populates ctx.slabs from deriveSlabs(cam, vp) — the single per-frame derivation', () => {
    const pose: CameraPose = { target: [0, 0, 0], yaw: 0.3, pitch: 0.1, distance: 100 };
    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(),
      pose,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    const cam = assembleOrbitCamera(pose, PROJECTION, BASIS, BASIS);
    const expected = deriveSlabs(cam, computeViewProj(cam));
    expect(ctx.slabs).toHaveLength(2);
    expect(ctx.slabs[0]?.index).toBe(NEAR0);
    expect(ctx.slabs[1]?.index).toBe(COSMO);
    expect(Array.from(ctx.slabs[0]!.vp)).toEqual(Array.from(expected[0]!.vp));
    expect(Array.from(ctx.slabs[1]!.vp)).toEqual(Array.from(expected[1]!.vp));
  });

  it('populates canvasSize from canvas dimensions', () => {
    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(800, 600),
      RESTING_POSE,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.canvasSize).toEqual({ width: 800, height: 600 });
  });

  it('forwards pointRenderer, renderTargets, texturedDisks references onto the ready context', () => {
    const pointRenderer = { tag: 'pointRenderer' };
    const renderTargets = { tag: 'renderTargets' };
    const texturedDisks = { tag: 'texturedDisks' };
    const ctx = deriveFrameContext(
      makeState({ pointRenderer, renderTargets, texturedDisks }),
      makeCanvas(),
      RESTING_POSE,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.pointRenderer).toBe(pointRenderer);
    expect(ctx.renderTargets).toBe(renderTargets);
    expect(ctx.texturedDisks).toBe(texturedDisks);
  });

  it('exposes visibleSourceMask and a seeded focus on the ready context', () => {
    const mask = 0b1011;
    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(),
      RESTING_POSE,
      PROJECTION,
      BASIS,
      BASIS,
      mask,
      0,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.visibleSourceMask).toBe(mask);
    expect(ctx.focus.blend).toBe(0);
  });

  it('stamps nowMs onto the ready context', () => {
    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(),
      RESTING_POSE,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      1234.5,
      CONST_J2000,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.nowMs).toBe(1234.5);
  });

  it('stamps simDays onto the ready context (the frame epoch every body reader shares)', () => {
    // simDays is a separate axis from nowMs: it is scene time (where the planets
    // are), threaded through so `sceneBodyStates(state, ctx)` evaluates the body
    // snapshot at one agreed instant. A non-J2000 value proves it is the passed
    // argument, not a re-derive.
    const SCRUBBED = 2_460_000.25;
    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(),
      RESTING_POSE,
      PROJECTION,
      BASIS,
      BASIS,
      0xffffffff,
      0,
      SCRUBBED,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.simDays).toBe(SCRUBBED);
  });
});
