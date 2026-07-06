/**
 * frameContext — unit tests for the per-frame derived snapshot.
 *
 * `deriveFrameContext` receives an already-produced `CameraPose` and a
 * `CameraProjection` (the engine Resources), assembles the full `OrbitCamera`
 * via `assembleOrbitCamera`, and pre-computes the view-projection matrix,
 * camera-position tuple, and pixel-per-radian scalar. These tests pin both
 * halves: the branching shape (ready vs not-ready) and the arithmetic.
 *
 * The threaded-pose variant (binding decision 1) means `deriveFrameContext`
 * does NOT re-call `runCameraDrivers` internally; it only calls
 * `assembleOrbitCamera(pose, projection)` + `computeViewProj`. The `cam` on
 * the ready context is the assembled camera, NOT `state.cam`.
 *
 * Tests also verify the bootstrap gate still works (cam=null → not-ready) even
 * though the rendered camera comes from the assembled pose, not `state.cam`.
 */

import { describe, it, expect } from 'vitest';

import { deriveFrameContext } from '../../../../src/services/engine/frame/frameContext';
import type { FrameContext } from '../../../../src/@types/engine/frame/FrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { CameraProjection } from '../../../../src/@types/camera/CameraProjection';
import { assembleOrbitCamera } from '../../../../src/services/engine/camera/assembleOrbitCamera';
import { computeViewProj } from '../../../../src/utils/camera/computeViewProj';

const RESTING_POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 };
const PROJECTION: CameraProjection = { fovYRad: 1, aspect: 16 / 9, near: 0.1, far: 10000 };

/**
 * Build an `EngineState`-shaped fixture with the guard fields
 * (`cam`, `gpu.renderer`, `gpu.postProcess`, `gpu.pickRenderer`,
 * `gpu.volumeOffscreen`, `subsystems.texturedDisks`) populated by default.
 * Each test can null any one to exercise the not-ready branch.
 *
 * `state.cam` is only used by the `isEngineReady` bootstrap gate (non-null
 * check); the rendered camera comes from `assembleOrbitCamera(pose, projection)`
 * passed as arguments.
 */
function makeState(
  overrides: {
    cam?: OrbitCamera | null;
    renderer?: unknown;
    postProcess?: unknown;
    pickRenderer?: unknown;
    volumeOffscreen?: unknown;
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
  const renderer = overrides.renderer === undefined ? ({} as unknown) : overrides.renderer;
  const postProcess = overrides.postProcess === undefined ? ({} as unknown) : overrides.postProcess;
  const pickRenderer =
    overrides.pickRenderer === undefined ? ({} as unknown) : overrides.pickRenderer;
  const volumeOffscreen =
    overrides.volumeOffscreen === undefined ? ({} as unknown) : overrides.volumeOffscreen;
  const texturedDisks =
    overrides.texturedDisks === undefined ? ({} as unknown) : overrides.texturedDisks;
  return {
    cam,
    gpu: { renderer, postProcess, pickRenderer, volumeOffscreen },
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
      0xffffffff,
      0,
    );
    expect(ctx.isReady).toBe(false);
  });

  it('returns isReady:false when gpu.renderer is null', () => {
    const ctx = deriveFrameContext(
      makeState({ renderer: null }),
      makeCanvas(),
      RESTING_POSE,
      PROJECTION,
      0xffffffff,
      0,
    );
    expect(ctx.isReady).toBe(false);
  });

  it('returns isReady:false when gpu.postProcess is null', () => {
    const ctx = deriveFrameContext(
      makeState({ postProcess: null }),
      makeCanvas(),
      RESTING_POSE,
      PROJECTION,
      0xffffffff,
      0,
    );
    expect(ctx.isReady).toBe(false);
  });

  it('returns isReady:false when gpu.volumeOffscreen is null', () => {
    const ctx = deriveFrameContext(
      makeState({ volumeOffscreen: null }),
      makeCanvas(),
      RESTING_POSE,
      PROJECTION,
      0xffffffff,
      0,
    );
    expect(ctx.isReady).toBe(false);
  });

  it('returns isReady:false when subsystems.texturedDisks is null', () => {
    const ctx = deriveFrameContext(
      makeState({ texturedDisks: null }),
      makeCanvas(),
      RESTING_POSE,
      PROJECTION,
      0xffffffff,
      0,
    );
    expect(ctx.isReady).toBe(false);
  });
});

describe('deriveFrameContext — ready branch', () => {
  it('assembles ctx.cam from pose + projection (not from state.cam)', () => {
    const pose: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: 0.1, distance: 50 };
    const projection: CameraProjection = { fovYRad: 1.2, aspect: 2, near: 0.01, far: 5000 };
    const ctx = deriveFrameContext(makeState(), makeCanvas(), pose, projection, 0xffffffff, 0);
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
      0xffffffff,
      0,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.cam.fovYRad).toBe(0.9);
  });

  it('drawPxPerRad uses projection.fovYRad', () => {
    const projection: CameraProjection = { fovYRad: 1, aspect: 16 / 9, near: 0.1, far: 10000 };
    const canvas = makeCanvas(1920, 1080);
    const ctx = deriveFrameContext(makeState(), canvas, RESTING_POSE, projection, 0xffffffff, 0);
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    // pxPerRad = height / (2 * tan(fovY / 2))
    const expected = 1080 / (2 * Math.tan(0.5));
    expect(ctx.drawPxPerRad).toBeCloseTo(expected, 6);
  });

  it('ctx.vp matches computeViewProj(assembleOrbitCamera(pose, projection))', () => {
    const pose: CameraPose = { target: [0, 0, 0], yaw: 0.3, pitch: 0.1, distance: 100 };
    const ctx = deriveFrameContext(makeState(), makeCanvas(), pose, PROJECTION, 0xffffffff, 0);
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    const expected = computeViewProj(assembleOrbitCamera(pose, PROJECTION));
    expect(Array.from(ctx.vp)).toEqual(Array.from(expected));
  });

  it('populates canvasSize from canvas dimensions', () => {
    const ctx = deriveFrameContext(
      makeState(),
      makeCanvas(800, 600),
      RESTING_POSE,
      PROJECTION,
      0xffffffff,
      0,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.canvasSize).toEqual({ width: 800, height: 600 });
  });

  it('forwards renderer, postProcess, texturedDisks references onto the ready context', () => {
    const renderer = { tag: 'renderer' };
    const postProcess = { tag: 'postProcess' };
    const texturedDisks = { tag: 'texturedDisks' };
    const ctx = deriveFrameContext(
      makeState({ renderer, postProcess, texturedDisks }),
      makeCanvas(),
      RESTING_POSE,
      PROJECTION,
      0xffffffff,
      0,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.renderer).toBe(renderer);
    expect(ctx.postProcess).toBe(postProcess);
    expect(ctx.texturedDisks).toBe(texturedDisks);
  });

  it('forwards volumeOffscreen reference onto the ready context', () => {
    const volumeOffscreen = { view: {} as GPUTextureView, resize: () => {}, destroy: () => {} };
    const ctx = deriveFrameContext(
      makeState({ volumeOffscreen }),
      makeCanvas(),
      RESTING_POSE,
      PROJECTION,
      0xffffffff,
      0,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.volumeOffscreen).toBe(volumeOffscreen);
  });

  it('exposes visibleSourceMask and a seeded focus on the ready context', () => {
    const mask = 0b1011;
    const ctx = deriveFrameContext(makeState(), makeCanvas(), RESTING_POSE, PROJECTION, mask, 0);
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
      0xffffffff,
      1234.5,
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.nowMs).toBe(1234.5);
  });
});

describe('deriveFrameContext — type narrowing', () => {
  it('narrows ctx.cam to non-null after the isReady guard (TS-level)', () => {
    const ctx: FrameContext = deriveFrameContext(
      makeState(),
      makeCanvas(),
      RESTING_POSE,
      PROJECTION,
      0xffffffff,
      0,
    );
    if (ctx.isReady) {
      // If FrameContext were `{ cam: OrbitCamera | null }` instead of a
      // discriminated union, this line would require a `!` non-null assertion.
      const cam: OrbitCamera = ctx.cam;
      expect(cam).toBeDefined();
    }
  });

  it('treats drawCamPos as readonly at the type level', () => {
    const ctx: FrameContext = deriveFrameContext(
      makeState(),
      makeCanvas(),
      RESTING_POSE,
      PROJECTION,
      0xffffffff,
      0,
    );
    if (ctx.isReady) {
      // @ts-expect-error — drawCamPos is Readonly<[...]>; index assignment is forbidden.
      ctx.drawCamPos[0] = 999;
    }
  });
});
