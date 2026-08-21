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
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';
import { assembleOrbitCamera } from '../../../../src/services/engine/camera/assembleOrbitCamera';
import { computeViewProj } from '../../../../src/utils/camera/computeViewProj';
import { deriveSlabs, NEAR0, COSMO } from '../../../../src/services/engine/frame/slabs';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { surfaceZoomBias } from '../../../../src/utils/camera/surfaceZoomBias';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';

const RESTING_POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 };
const PROJECTION: CameraProjection = { fovYRad: 1, aspect: 16 / 9, near: 0.1, far: 10000 };

// Identity basis: the frame-local decode is already world space, so every case
// below reproduces the pre-feature (basis-free) geometry exactly.
const BASIS: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * Build an `EngineState`-shaped fixture with the guard fields
 * (`cam`, `gpu.galaxyPointRenderer`, `gpu.renderTargets`, `gpu.galaxyPickRenderer`,
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
    galaxyPointRenderer?: unknown;
    renderTargets?: unknown;
    galaxyPickRenderer?: unknown;
    compositor?: unknown;
    texturedDisks?: unknown;
    // Task 2 (surfaceZoomBias) additions: `null` in both fixtures below
    // reproduces the pre-feature (no eye-bias) behaviour every pre-existing
    // arithmetic assertion in this file was written against.
    focusRow?: SelectionRow | null;
    zoomBiasAnchor?: {
      readonly bodyId: BodyId;
      readonly point: { lonDeg: number; latDeg: number };
    } | null;
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
  const galaxyPointRenderer =
    overrides.galaxyPointRenderer === undefined ? ({} as unknown) : overrides.galaxyPointRenderer;
  const renderTargets =
    overrides.renderTargets === undefined ? ({} as unknown) : overrides.renderTargets;
  const galaxyPickRenderer =
    overrides.galaxyPickRenderer === undefined ? ({} as unknown) : overrides.galaxyPickRenderer;
  const compositor = overrides.compositor === undefined ? ({} as unknown) : overrides.compositor;
  const texturedDisks =
    overrides.texturedDisks === undefined ? ({} as unknown) : overrides.texturedDisks;
  const focusRow = overrides.focusRow === undefined ? null : overrides.focusRow;
  const zoomBiasAnchor = overrides.zoomBiasAnchor === undefined ? null : overrides.zoomBiasAnchor;
  return {
    cam,
    gpu: { galaxyPointRenderer, renderTargets, galaxyPickRenderer, compositor },
    subsystems: { texturedDisks },
    // No focused pivot in these fixtures — `deriveSlabs` gets `pivotRadiusMpc:
    // null`, reproducing the pre-feature (raw cam.distance) near-field bracket
    // every arithmetic assertion below was written against.
    selectionRows: { hover: null, select: null, focus: focusRow },
    picking: { pickInFlight: false, pointerDown: false, hoveredSurfacePoint: null, zoomBiasAnchor },
  } as unknown as EngineState;
}

/** A minimal `SelectionRow` body-arm fixture, focused on Earth. */
function makeBodyFocusRow(radiusKm = 6371): Extract<SelectionRow, { type: 'body' }> {
  return { type: 'body', id: 'earth', label: 'Earth', positionMpc: [0, 0, 0], radiusKm };
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

  it('returns isReady:false when gpu.galaxyPointRenderer is null', () => {
    const ctx = deriveFrameContext(
      makeState({ galaxyPointRenderer: null }),
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

  it('forwards galaxyPointRenderer, renderTargets, texturedDisks references onto the ready context', () => {
    const galaxyPointRenderer = { tag: 'galaxyPointRenderer' };
    const renderTargets = { tag: 'renderTargets' };
    const texturedDisks = { tag: 'texturedDisks' };
    const ctx = deriveFrameContext(
      makeState({ galaxyPointRenderer, renderTargets, texturedDisks }),
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
    expect(ctx.galaxyPointRenderer).toBe(galaxyPointRenderer);
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

describe('deriveFrameContext — surfaceZoomBias eye-bias (spec §4.2/§4.3)', () => {
  // Real body id ('earth') so `deriveBodyStates(simDays).get(focusRow.id)`
  // resolves — `deriveFrameContext` calls the real function, not an
  // injectable stub, so the body state has to come from the real registry.
  // Expected deltas are recomputed via `surfaceZoomBias` itself (an
  // independent call with the SAME inputs `frameContext.ts` uses), not
  // hand-copied from a run of the production code.
  const ANCHOR_POINT = { lonDeg: -30, latDeg: 45 };
  // Earth's radius is ~2e-16 Mpc — a pose distance of 100 Mpc (this file's
  // other fixtures) sits astronomically past the falloff, so the two tests
  // that need a non-zero bias use a distance close to the body's own scale.
  const EARTH_RADIUS_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;

  it('shifts ctx.drawCamPos when a matching zoomBiasAnchor is present', () => {
    const pose: CameraPose = {
      target: [0, 0, 0],
      yaw: 0.3,
      pitch: 0.1,
      distance: EARTH_RADIUS_MPC * 2,
    };
    const focusRow = makeBodyFocusRow();
    const zoomBiasAnchor = { bodyId: 'earth' as BodyId, point: ANCHOR_POINT };
    const ctx = deriveFrameContext(
      makeState({ focusRow, zoomBiasAnchor }),
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

    const unbiasedCam = assembleOrbitCamera(pose, PROJECTION, BASIS, BASIS);
    const bodyState = deriveBodyStates(CONST_J2000).get('earth')!;
    const radiusMpc = focusRow.radiusKm * SCALE_UNITS.KM_TO_MPC;
    const delta = surfaceZoomBias(
      ANCHOR_POINT,
      bodyState.orientation,
      bodyState.positionMpc,
      radiusMpc,
      unbiasedCam.distance - radiusMpc,
      unbiasedCam.position,
    );
    // Sanity: the anchor actually produces a non-zero correction here —
    // otherwise the exact-match assertions below would pass vacuously.
    expect(Math.hypot(delta[0], delta[1], delta[2])).toBeGreaterThan(0);

    expect(ctx.drawCamPos[0]).toBeCloseTo(unbiasedCam.position[0] + delta[0], 10);
    expect(ctx.drawCamPos[1]).toBeCloseTo(unbiasedCam.position[1] + delta[1], 10);
    expect(ctx.drawCamPos[2]).toBeCloseTo(unbiasedCam.position[2] + delta[2], 10);
  });

  it('is a no-op when the zoomBiasAnchor bodyId does not match the focused body', () => {
    const pose: CameraPose = { target: [0, 0, 0], yaw: 0.3, pitch: 0.1, distance: 100 };
    const focusRow = makeBodyFocusRow();
    // Anchor names a DIFFERENT body than the one focused — the read-time
    // "clears on focus change" gate must treat this as absent.
    const zoomBiasAnchor = { bodyId: 'mars' as BodyId, point: ANCHOR_POINT };
    const ctx = deriveFrameContext(
      makeState({ focusRow, zoomBiasAnchor }),
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

    const unbiasedCam = assembleOrbitCamera(pose, PROJECTION, BASIS, BASIS);
    expect(Array.from(ctx.drawCamPos)).toEqual(Array.from(unbiasedCam.position));
  });

  it('is a no-op with no zoomBiasAnchor — regression floor for the unbiased frame', () => {
    const pose: CameraPose = { target: [0, 0, 0], yaw: 0.3, pitch: 0.1, distance: 100 };
    const focusRow = makeBodyFocusRow();
    const ctx = deriveFrameContext(
      makeState({ focusRow, zoomBiasAnchor: null }),
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

    const unbiasedCam = assembleOrbitCamera(pose, PROJECTION, BASIS, BASIS);
    expect(Array.from(ctx.drawCamPos)).toEqual(Array.from(unbiasedCam.position));
  });

  it('still applies when pose comes from an active orbit drag (spec §4.3)', () => {
    // A non-default yaw/pitch/distance stands in for a drag-produced pose:
    // `deriveFrameContext` has no notion of which driver produced `pose` —
    // the bias hook runs unconditionally after `assembleOrbitCamera`
    // regardless, so the same exact-match assertion holds here too.
    const pose: CameraPose = {
      target: [0, 0, 0],
      yaw: 1.7,
      pitch: -0.4,
      distance: EARTH_RADIUS_MPC * 3,
    };
    const focusRow = makeBodyFocusRow();
    const zoomBiasAnchor = { bodyId: 'earth' as BodyId, point: ANCHOR_POINT };
    const ctx = deriveFrameContext(
      makeState({ focusRow, zoomBiasAnchor }),
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

    const unbiasedCam = assembleOrbitCamera(pose, PROJECTION, BASIS, BASIS);
    const bodyState = deriveBodyStates(CONST_J2000).get('earth')!;
    const radiusMpc = focusRow.radiusKm * SCALE_UNITS.KM_TO_MPC;
    const delta = surfaceZoomBias(
      ANCHOR_POINT,
      bodyState.orientation,
      bodyState.positionMpc,
      radiusMpc,
      unbiasedCam.distance - radiusMpc,
      unbiasedCam.position,
    );
    expect(ctx.drawCamPos[0]).toBeCloseTo(unbiasedCam.position[0] + delta[0], 10);
    expect(ctx.drawCamPos[1]).toBeCloseTo(unbiasedCam.position[1] + delta[1], 10);
    expect(ctx.drawCamPos[2]).toBeCloseTo(unbiasedCam.position[2] + delta[2], 10);
  });
});
