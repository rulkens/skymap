/**
 * starPointsLayer — unit tests for the point-partition star content row.
 *
 * The load-bearing threading assertion here is the f64 rebase seam: like the
 * captions in `foregroundLabelsLayer`, the point anchors and the NEAR0 view
 * translation are near-equal parsec-scale numbers during the final approach to
 * a local star, so an f32 subtraction cancels catastrophically and jitters the
 * sprite centre. The layer must therefore hand the renderer CAMERA-RELATIVE
 * positions (`pos − camPos`, computed in f64) paired with the REBASED
 * view-projection (`rebaseViewProj(view.slab.vp, camPos)`) — NOT the raw
 * anchors through the f32-narrowed `view.vp`.
 *
 * The membership assertions pin the other half of the structural XOR: the
 * layer uploads (via `setStars`) EXACTLY the `points` branch of
 * `partitionStarsByResolution` — the complement of the `spheres` branch
 * `starSpheresLayer`'s suite asserts over the same
 * camera-half-an-AU-off-Proxima mixed fixture. Because the anchors are rebased
 * per frame, the upload is per-frame (no membership cache): a promoted star
 * still LEAVES the point set the frame it resolves, so it is never drawn as
 * point AND sphere — the double-draw the partition exists to forbid.
 */

import { describe, it, expect, vi } from 'vitest';

import { starPointsLayer } from '../../../../../src/services/engine/frame/passes/starPointsLayer';
import { rebaseViewProj } from '../../../../../src/utils/camera/rebaseViewProj';
import { SCENE_STARS } from '../../../../../src/data/bodies/sceneBodies';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { StarBody } from '../../../../../src/@types/scene/StarBody';
import type { Vec2 } from '../../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const SUN = SCENE_STARS.find((star) => star.id === 'sun')!;
const PROXIMA = SCENE_STARS.find((star) => star.id === 'proxima-centauri')!;
const SIRIUS = SCENE_STARS.find((star) => star.id === 'sirius')!;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

// Bare ctx for the null-renderer cases only: the handle check must
// short-circuit BEFORE any ctx (or state.data) read.
const CTX_STUB = {} as ReadyFrameContext;

/**
 * The partition inputs a layer reads off the frame context: the absolute
 * camera position, the vertical fov, and the viewport height. 60° fov +
 * 720-px viewport matches the SlabView fixture below.
 */
function makeCtx(camPos: Readonly<Vec3>): ReadyFrameContext {
  return {
    drawCamPos: camPos,
    fovYRad: Math.PI / 3,
    canvasSize: { width: 1280, height: 720 },
  } as unknown as ReadyFrameContext;
}

/**
 * A camera half an AU from the given position: a solar-diameter sphere at
 * that range subtends ~12 px in this fixture's 720-px, 60°-fov viewport —
 * above STAR_RESOLVE_PX — while stars parsecs away stay sub-pixel.
 */
function halfAuFrom(positionMpc: Readonly<Vec3>): Vec3 {
  return [positionMpc[0] + 0.5 * SCALE_UNITS.AU_TO_MPC, positionMpc[1], positionMpc[2]];
}

/**
 * A SlabView whose f64 `slab.vp` and f32 `vp` are deliberately DIFFERENT
 * arrays, so identity checks reveal which one the layer threads — here the
 * f32 narrow is the CORRECT choice.
 */
function makeNear0View(camPos: Vec3): SlabView {
  const f64Vp = Float64Array.from({ length: 16 }, (_, i) => i + 0.5);
  const f32Vp = new Float32Array(16);
  const slab: Slab = {
    index: NEAR0,
    nearMpc: 0.0005,
    farMpc: 500,
    vp: f64Vp,
    originRelative: true,
    precision: 'f64',
  };
  return {
    slab,
    vp: f32Vp,
    camPos,
    viewportPx: [1280, 720],
  };
}

/** A fresh spy renderer with the StarPointRenderer draw surface. */
function makeRenderer() {
  return {
    setStars: vi.fn<(stars: readonly StarBody[]) => void>(),
    draw: vi.fn<(pass: GPURenderPassEncoder, viewProj: Float32Array, viewportPx: Vec2) => void>(),
  };
}

/** State with a `starPointRenderer` handle and a seeded star list. */
function makeState(starPointRenderer: unknown, stars: readonly StarBody[]): EngineState {
  return {
    gpu: { starPointRenderer },
    data: { bodies: { stars } },
  } as unknown as EngineState;
}

describe('starPointsLayer.enabled', () => {
  it('is false while starPointRenderer is null and while every star resolves; true with a point star', () => {
    const renderer = makeRenderer();
    // Null handle. NOTE: deliberately no state.data and a bare ctx — the
    // handle check must short-circuit BEFORE either is touched (renderFrame
    // fixtures carry null handles and no bodies bag).
    expect(
      starPointsLayer.enabled(
        { gpu: { starPointRenderer: null } } as unknown as EngineState,
        CTX_STUB,
      ),
    ).toBe(false);
    // Renderer + the Sun alone: the alwaysResolved Sun is entirely in the
    // spheres branch, so the points branch is empty.
    const galaxyCtx = makeCtx([0, 0, 0.43]);
    const sunOnly = SCENE_STARS.filter((star) => star.id === 'sun');
    expect(starPointsLayer.enabled(makeState(renderer, sunOnly), galaxyCtx)).toBe(false);
    // Renderer + the full seed at galaxy scale: 24 sub-pixel neighbours.
    expect(starPointsLayer.enabled(makeState(renderer, SCENE_STARS), galaxyCtx)).toBe(true);
  });
});

describe('starPointsLayer.draw', () => {
  it('threads the REBASED vp (not the raw f32 view.vp) and view.viewportPx to draw', () => {
    const renderer = makeRenderer();
    const camPos: Vec3 = [0, 0, 5];
    const view = makeNear0View(camPos);
    const state = makeState(renderer, SCENE_STARS);

    starPointsLayer.draw(PASS_STUB, view, makeCtx(camPos), state);

    expect(renderer.draw).toHaveBeenCalledTimes(1);
    const [passArg, vpArg, viewportArg] = renderer.draw.mock.calls[0]!;
    expect(passArg).toBe(PASS_STUB);
    // The vp is rebased into the camera-relative frame off the f64 slab vp —
    // NOT the f32-narrowed view.vp, whose translation bits are already gone and
    // which would leave the sprite centre to cancel catastrophically.
    expect(vpArg).not.toBe(view.vp);
    expect(vpArg).toEqual(rebaseViewProj(view.slab.vp, camPos));
    expect(viewportArg).toBe(view.viewportPx);
  });

  it('uploads camera-relative anchors (pos − camPos), not the raw star positions', () => {
    const renderer = makeRenderer();
    // Camera parsecs down the +z axis: Proxima and Sirius stay points, and the
    // anchors handed to the renderer must be their positions MINUS the eye.
    const camPos: Vec3 = [0, 0, 5];
    const view = makeNear0View(camPos);
    const state = makeState(renderer, [SUN, PROXIMA, SIRIUS]);

    starPointsLayer.draw(PASS_STUB, view, makeCtx(camPos), state);

    const uploaded = renderer.setStars.mock.calls[0]![0];
    // Same membership + order as the raw points branch (Sun always resolves).
    expect(uploaded.map((star) => star.id)).toEqual([PROXIMA.id, SIRIUS.id]);
    // Each anchor is rebased: pos − camPos, computed in f64 before narrowing.
    // A raw upload would leave positionMpc equal to PROXIMA.positionMpc.
    expect(uploaded[0]!.positionMpc).toEqual([
      PROXIMA.positionMpc[0] - camPos[0],
      PROXIMA.positionMpc[1] - camPos[1],
      PROXIMA.positionMpc[2] - camPos[2],
    ]);
    expect(uploaded[0]!.positionMpc).not.toEqual(PROXIMA.positionMpc);
  });

  it('starPointsLayer draws only the point stars', () => {
    const renderer = makeRenderer();
    // Mixed fixture, camera half an AU off Proxima: the Sun (alwaysResolved)
    // and Proxima (resolved) belong to starSpheresLayer — its suite asserts
    // exactly that set over this same fixture — leaving Sirius as the one
    // point star. Disjoint + covering by construction: the structural XOR.
    const camPos = halfAuFrom(PROXIMA.positionMpc);
    const view = makeNear0View(camPos);
    const state = makeState(renderer, [SUN, PROXIMA, SIRIUS]);

    starPointsLayer.draw(PASS_STUB, view, makeCtx(camPos), state);

    expect(renderer.setStars).toHaveBeenCalledTimes(1);
    expect(renderer.setStars.mock.calls[0]![0].map((star) => star.id)).toEqual([SIRIUS.id]);
    expect(renderer.draw).toHaveBeenCalledTimes(1);
  });

  it('re-uploads every frame (rebased anchors) and drops a star the frame it resolves', () => {
    const renderer = makeRenderer();
    const state = makeState(renderer, [SUN, PROXIMA, SIRIUS]);

    // Two galaxy-scale frames with identical membership: because the anchors
    // are rebased per frame there is no membership cache — each draw re-uploads.
    const farCam: Vec3 = [0, 0, 5];
    starPointsLayer.draw(PASS_STUB, makeNear0View(farCam), makeCtx(farCam), state);
    starPointsLayer.draw(PASS_STUB, makeNear0View(farCam), makeCtx(farCam), state);
    expect(renderer.setStars).toHaveBeenCalledTimes(2);
    expect(renderer.setStars.mock.calls[0]![0].map((star) => star.id)).toEqual([
      PROXIMA.id,
      SIRIUS.id,
    ]);

    // The camera closes on Proxima: it resolves, so it must LEAVE the
    // uploaded point set — otherwise it would draw as point AND sphere.
    const nearCam = halfAuFrom(PROXIMA.positionMpc);
    starPointsLayer.draw(PASS_STUB, makeNear0View(nearCam), makeCtx(nearCam), state);
    expect(renderer.setStars).toHaveBeenCalledTimes(3);
    expect(renderer.setStars.mock.calls[2]![0].map((star) => star.id)).toEqual([SIRIUS.id]);
    expect(renderer.draw).toHaveBeenCalledTimes(3);
  });

  it('is a no-op when the starPointRenderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View([0, 0, 5]);
    const state = { gpu: { starPointRenderer: null } } as unknown as EngineState;
    expect(() => starPointsLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });
});
