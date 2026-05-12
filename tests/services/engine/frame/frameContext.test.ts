/**
 * frameContext — unit tests for the per-frame derived snapshot.
 *
 * `deriveFrameContext` is the seed of Spec D's per-frame abstraction
 * stack: it lifts the 5-way "is the engine ready?" null check (camera +
 * GPU renderer + post-process + thumbnail subsystem) out of the frame
 * body and into one named predicate, and it computes the two derived
 * scalars (`drawCamPos`, `drawPxPerRad`) that today live in
 * `renderFrame.ts:286–297`.  These tests pin both halves down: the
 * branching shape (ready vs not-ready) and the arithmetic (the pinhole
 * pxPerRad formula and the camera-position tuple snapshot).
 *
 * We don't need a live GPU device or a real OrbitCamera here — the
 * derivation is pure: it reads a handful of fields off `state` and a
 * couple off `canvas`, computes a matrix and a scalar, and returns.
 * Stubbing through `unknown` keeps the fixture small and forces a
 * runtime failure if the implementation grows a new dependency we
 * forgot to satisfy.
 */

import { describe, it, expect } from 'vitest';

import { deriveFrameContext } from '../../../../src/services/engine/frame/frameContext';
import type { FrameContext } from '../../../../src/@types/engine/frame/FrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';

/**
 * Build an `OrbitCamera`-shaped stub with just enough fields populated
 * for `computeViewProj` to run without throwing and for the per-frame
 * derivations (`drawCamPos`, `drawPxPerRad`) to read what they need.
 */
function makeCam(overrides: Partial<OrbitCamera> = {}): OrbitCamera {
  // Defaults chosen so the fovY/2 = 0.5 rad path gives a clean tan() value
  // for the pxPerRad assertion below.  height / (2 * tan(0.5)) is the test
  // arithmetic; we pin it precisely in the "ready" test.
  return {
    target: [0, 0, 0],
    distance: 100,
    yaw: 0,
    pitch: 0,
    roll: 0,
    fovYRad: 1,
    aspect: 16 / 9,
    near: 0.1,
    far: 10000,
    position: [10, 20, 30],
    ...overrides,
  } as unknown as OrbitCamera;
}

/**
 * Build an `EngineState`-shaped fixture with the four guard fields
 * (`cam`, `gpu.renderer`, `gpu.postProcess`, `subsystems.texturedImpostors`)
 * populated by default.  Each test override can null any one of them
 * to exercise the not-ready branch.
 */
function makeState(overrides: {
  cam?: OrbitCamera | null;
  renderer?: unknown;
  postProcess?: unknown;
  texturedImpostors?: unknown;
} = {}): EngineState {
  const cam = overrides.cam === undefined ? makeCam() : overrides.cam;
  const renderer = overrides.renderer === undefined ? ({} as unknown) : overrides.renderer;
  const postProcess =
    overrides.postProcess === undefined ? ({} as unknown) : overrides.postProcess;
  const texturedImpostors =
    overrides.texturedImpostors === undefined ? ({} as unknown) : overrides.texturedImpostors;
  return {
    cam,
    gpu: { renderer, postProcess },
    subsystems: { texturedImpostors },
  } as unknown as EngineState;
}

function makeCanvas(width = 1920, height = 1080): HTMLCanvasElement {
  return { width, height } as unknown as HTMLCanvasElement;
}

describe('deriveFrameContext — not-ready branch', () => {
  it('returns isReady:false when state.cam is null', () => {
    const ctx = deriveFrameContext(makeState({ cam: null }), makeCanvas());
    expect(ctx.isReady).toBe(false);
  });

  it('returns isReady:false when gpu.renderer is null', () => {
    const ctx = deriveFrameContext(makeState({ renderer: null }), makeCanvas());
    expect(ctx.isReady).toBe(false);
  });

  it('returns isReady:false when gpu.postProcess is null', () => {
    const ctx = deriveFrameContext(makeState({ postProcess: null }), makeCanvas());
    expect(ctx.isReady).toBe(false);
  });

  it('returns isReady:false when subsystems.texturedImpostors is null', () => {
    const ctx = deriveFrameContext(makeState({ texturedImpostors: null }), makeCanvas());
    expect(ctx.isReady).toBe(false);
  });
});

describe('deriveFrameContext — ready branch', () => {
  it('populates cam, vp, canvasSize, drawCamPos, drawPxPerRad when every guard is non-null', () => {
    const cam = makeCam({
      fovYRad: 1, // tan(0.5) ≈ 0.5463024898
      position: [10, 20, 30],
    });
    const state = makeState({ cam });
    const canvas = makeCanvas(1920, 1080);

    const ctx = deriveFrameContext(state, canvas);

    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return; // narrow for TS

    expect(ctx.cam).toBe(cam);
    expect(ctx.canvasSize).toEqual({ width: 1920, height: 1080 });
    expect(ctx.drawCamPos).toEqual([10, 20, 30]);

    // pxPerRad = height / (2 * tan(fovY / 2))
    //         = 1080 / (2 * tan(0.5))
    const expectedPxPerRad = 1080 / (2 * Math.tan(0.5));
    expect(ctx.drawPxPerRad).toBeCloseTo(expectedPxPerRad, 6);

    // vp is a 16-float matrix produced by computeViewProj; we don't
    // pin its exact contents here (orbitCamera.test.ts owns that), we
    // just verify the field is populated and shaped right.
    expect(ctx.vp).toBeDefined();
    expect(ctx.vp.length).toBe(16);
  });

  it('forwards renderer, postProcess, texturedImpostors references onto the ready context', () => {
    const renderer = { tag: 'renderer' };
    const postProcess = { tag: 'postProcess' };
    const texturedImpostors = { tag: 'texturedImpostors' };
    const ctx = deriveFrameContext(
      makeState({ renderer, postProcess, texturedImpostors }),
      makeCanvas(),
    );
    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(ctx.renderer).toBe(renderer);
    expect(ctx.postProcess).toBe(postProcess);
    expect(ctx.texturedImpostors).toBe(texturedImpostors);
  });
});

describe('deriveFrameContext — type narrowing', () => {
  it('narrows ctx.cam to non-null after the isReady guard (TS-level)', () => {
    // This test exists for the compile-time narrowing assertion.  The
    // body is a runtime no-op; tsc proves the win.
    const ctx: FrameContext = deriveFrameContext(makeState(), makeCanvas());
    if (ctx.isReady) {
      // If `FrameContext` were `{ cam: OrbitCamera | null }` instead of
      // a discriminated union, this line would require a `!` non-null
      // assertion.  The assignment-without-`!` is the test.
      const cam: OrbitCamera = ctx.cam;
      expect(cam).toBeDefined();
    }
  });

  it('treats drawCamPos as readonly at the type level', () => {
    const ctx: FrameContext = deriveFrameContext(makeState(), makeCanvas());
    if (ctx.isReady) {
      // @ts-expect-error — drawCamPos is Readonly<[...]>; index assignment is forbidden.
      ctx.drawCamPos[0] = 999;
      // The runtime side of this is permissive (Readonly<T> is a
      // type-only modifier; the underlying array is still mutable).
      // The compile-time error is the contract we care about.
    }
  });
});
