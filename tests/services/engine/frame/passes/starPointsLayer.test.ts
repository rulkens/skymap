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
 * camera-half-an-AU-off-Sirius mixed fixture. Because the anchors are rebased
 * per frame, the upload is per-frame (no membership cache): a promoted star
 * still LEAVES the point set the frame it resolves, so it is never drawn as
 * point AND sphere — the double-draw the partition exists to forbid.
 */

import { describe, it, expect, vi } from 'vitest';

import { starPointsLayer } from '../../../../../src/services/engine/frame/passes/starPointsLayer';
import { CONTENT_LAYERS } from '../../../../../src/services/engine/frame/passes';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCALE_FADE_BANDS } from '../../../../../src/services/engine/presentation/scaleFadeBands';
import { fadeBand } from '../../../../../src/utils/math/fadeBand';
import { rebaseViewProj } from '../../../../../src/utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../../src/utils/math/narrowMat4';
import { starExposureRamp } from '../../../../../src/services/gpu/renderers/starCatalog/starExposureRamp';
import { SCENE_STARS } from '../../../../../src/data/bodies/sceneStars';
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
 * The gate + partition inputs a layer reads off the frame context: the orbit
 * distance (the shared foreground gate reads `ctx.cam.distance`), the
 * absolute camera position, the vertical fov, and the viewport height.
 * 60° fov + 720-px viewport matches the SlabView fixture below. The orbit
 * distance is |camPos| — these fixtures orbit the heliocentric origin, so
 * the two coincide.
 */
function makeCtx(camPos: Readonly<Vec3>): ReadyFrameContext {
  return {
    cam: { distance: Math.hypot(camPos[0], camPos[1], camPos[2]) },
    drawCamPos: camPos,
    fovYRad: Math.PI / 3,
    canvasSize: { width: 1280, height: 720 },
  } as unknown as ReadyFrameContext;
}

// A below-gate camera 5 kpc down +z: well inside FOREGROUND_MAX_DISTANCE_MPC
// (~0.23 Mpc) AND inside the starBackdrop band's live range (goneAt ~0.023 Mpc),
// so both the distance gate and the band pass — yet still parsecs beyond every
// seeded star, so all 24 non-Sun neighbours stay sub-pixel points.
const NEAR_FIELD_CAM: Readonly<Vec3> = [0, 0, 5e-3];

// A camera within MAX_ORBIT_EXTENT_MPC of the origin — Neptune's ~30 AU orbit
// is the system's farthest reach, ~1.5e-10 Mpc — so orbitTrailsLayer's
// whole-layer sub-pixel bound (its module header) clamps the camera's nearest
// possible distance to any orbit point to 0 and treats every orbit as
// always-visible, regardless of apparent size. NEAR_FIELD_CAM (5 kpc out) is
// many orders of magnitude too far for that — orbit-trails legitimately
// disables there — so the group assertion that needs BOTH star-points and
// orbit-trails enabled needs this much closer camera instead.
const NEAR_ORBIT_CAM: Readonly<Vec3> = [0, 0, 1e-10];

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
    reversedZ: false,
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
    draw: vi.fn<
      (
        pass: GPURenderPassEncoder,
        viewProj: Float32Array,
        viewportPx: Vec2,
        opts: { sizePx: number; brightness: number },
      ) => void
    >(),
  };
}

/**
 * The `starCatalogs` appearance slice the layer reads: the shared sizePx slider,
 * the brightness trim, and the three exposure-ramp anchors. Concrete non-default
 * values so the ramp fold is observable (a raw-brightness bug would show).
 */
const STAR_CATALOG_SETTINGS = {
  sizePx: 3.25,
  brightness: 0.8,
  exposureNearX: 15,
  exposureMidX: 57,
  exposureFarX: 70,
};

/** State with a `starPointRenderer` handle, a seeded star list, and settings. */
function makeState(
  starPointRenderer: unknown,
  stars: readonly StarBody[],
  famousStarsEnabled = true,
): EngineState {
  return {
    gpu: { starPointRenderer },
    data: { bodies: { stars } },
    settings: { starCatalogs: STAR_CATALOG_SETTINGS, famousStars: { enabled: famousStarsEnabled } },
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
    // Renderer + the Sun alone with the camera half an AU off it: the Sun
    // resolves to a sphere, so the points branch is empty.
    const sunOnly = SCENE_STARS.filter((star) => star.id === 'sun');
    const onSunCtx = makeCtx(
      halfAuFrom(SCENE_STARS.find((star) => star.id === 'sun')!.positionMpc),
    );
    expect(starPointsLayer.enabled(makeState(renderer, sunOnly), onSunCtx)).toBe(false);
    // Renderer + the full seed inside the gate at 5 kpc: every star — the
    // Sun included — is a sub-pixel point.
    const nearCtx = makeCtx(NEAR_FIELD_CAM);
    expect(starPointsLayer.enabled(makeState(renderer, SCENE_STARS), nearCtx)).toBe(true);
  });

  it('is disabled beyond the foreground gate even with point stars present', () => {
    // A decade beyond the gate (cosmic scale) the whole neighbourhood is far
    // below a pixel: the shared gate turns the backdrop off before the
    // partition is even computed, so the (hdr, NEAR0) step can be skipped
    // wholesale. Derived from the gate so a farther seed growing it carries.
    const state = makeState(makeRenderer(), SCENE_STARS);
    expect(starPointsLayer.enabled(state, makeCtx([0, 0, FOREGROUND_MAX_DISTANCE_MPC * 10]))).toBe(
      false,
    );
  });

  it('is disabled once the backdrop band has dissolved, even inside the foreground gate', () => {
    // Just past the backdrop band's goneAt but still WELL inside the shared
    // foreground gate: the additive sprite field has faded to black, so the
    // layer must disable outright (the "opacity 0 ⇒ no render" house rule)
    // rather than draw invisible sprites and hold the (hdr, NEAR0) step open.
    // Derived from the band + gate so a roster growth carries both edges.
    const beyondBand = SCALE_FADE_BANDS.starBackdrop.goneAt * 1.01;
    expect(beyondBand).toBeLessThan(FOREGROUND_MAX_DISTANCE_MPC); // still inside the gate
    const state = makeState(makeRenderer(), SCENE_STARS);
    expect(starPointsLayer.enabled(state, makeCtx([0, 0, beyondBand]))).toBe(false);
  });
});

describe('the (hdr, NEAR0) render group above the foreground gate', () => {
  it('empties above the gate and is non-empty below it (the wholesale-skip property)', () => {
    // The SAME group filter executeFrame's render step applies, over the
    // early (hdr, NEAR0) step that draws star-points + orbit-trails BEFORE the
    // tone-map. Above the gate this group must come back empty too — not just
    // the (foreground:0, NEAR0) body group — for the skip to be wholesale.
    const state = {
      // starCatalogRenderer null (like the real gpu bag pre-load): no Gaia bin
      // committed here, so starCatalogLayer — one of the group's (hdr, NEAR0)
      // rows — short-circuits its handle gate and stays out of this assertion.
      gpu: {
        starPointRenderer: makeRenderer(),
        orbitTrailRenderer: { draw: vi.fn() },
        // Explicit null so bodyGlintsLayer.enabled (a member of the same
        // (hdr, NEAR0) group this filter walks) short-circuits on its strict
        // `=== null` handle check rather than reading state.data.bodies.planets,
        // which this star-focused fixture does not carry.
        bodyGlintRenderer: null,
        starCatalogRenderer: null,
      },
      data: { bodies: { stars: SCENE_STARS } },
      // The milky-way impostor also rides this group now (its slab moved to
      // NEAR0), but its visibility window is far WIDER than the foreground
      // gate — at galaxy scale it legitimately draws while the star rows
      // skip. Toggle it off (and zero its fade tail) so this test keeps
      // pinning the STAR rows' wholesale-skip property.
      // orbit-trails rides this same (hdr, NEAR0) group; its enabled() gate reads
      // the visibility intent, so the fixture carries the toggle on (matching the
      // live default) — below the gate it draws alongside star-points.
      settings: {
        milkyWay: { enabled: false },
        famousStars: { enabled: true },
        orbitTrails: { enabled: true },
      },
      subsystems: { fades: { opacityOf: () => 0 } },
    } as unknown as EngineState;
    const groupAt = (ctx: ReadyFrameContext) =>
      CONTENT_LAYERS.filter((l) => l.target === 'hdr' && l.slab === NEAR0 && l.enabled(state, ctx));

    // Below the gate: the point backdrop + the rings both draw. Uses
    // NEAR_ORBIT_CAM, not NEAR_FIELD_CAM — orbit-trails additionally requires
    // the camera within MAX_ORBIT_EXTENT_MPC of the system (see that
    // constant's comment), a far tighter bound than the shared foreground
    // gate NEAR_FIELD_CAM alone satisfies.
    expect(groupAt(makeCtx(NEAR_ORBIT_CAM)).map((l) => l.name)).toEqual([
      'star-points',
      'orbit-trails',
    ]);
    // Above the gate: empty group → the executor never opens the pass. Gate
    // edge + a decade beyond, both derived from the gate.
    expect(groupAt(makeCtx([0, 0, FOREGROUND_MAX_DISTANCE_MPC]))).toEqual([]);
    expect(groupAt(makeCtx([0, 0, FOREGROUND_MAX_DISTANCE_MPC * 10]))).toEqual([]);
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
    // which would leave the sprite centre to cancel catastrophically. The
    // rebase stays f64; the layer narrows at this upload boundary, so the
    // uploaded matrix is the f32 narrow of the f64 rebase.
    expect(vpArg).not.toBe(view.vp);
    expect(vpArg).toEqual(narrowMat4(rebaseViewProj(view.slab.vp, camPos)));
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
    // Same membership + order as the raw points branch — parsecs from
    // everything, the Sun is a sub-pixel point like its neighbours.
    expect(uploaded.map((star) => star.id)).toEqual([SUN.id, PROXIMA.id, SIRIUS.id]);
    // Each anchor is rebased: pos − camPos, computed in f64 before narrowing.
    // A raw upload would leave positionMpc equal to PROXIMA.positionMpc.
    const uploadedProxima = uploaded.find((star) => star.id === PROXIMA.id)!;
    expect(uploadedProxima.positionMpc).toEqual([
      PROXIMA.positionMpc[0] - camPos[0],
      PROXIMA.positionMpc[1] - camPos[1],
      PROXIMA.positionMpc[2] - camPos[2],
    ]);
    expect(uploadedProxima.positionMpc).not.toEqual(PROXIMA.positionMpc);
  });

  it('starPointsLayer draws only the point stars', () => {
    const renderer = makeRenderer();
    // Mixed fixture, camera half an AU off Sirius: only Sirius resolves
    // (1.71 R☉) and belongs to starSpheresLayer — its suite asserts exactly
    // that set over this same fixture — leaving the Sun and Proxima (parsecs
    // out, sub-pixel: a point is what keeps them VISIBLE from here) as the
    // point stars. Disjoint + covering by construction: the structural XOR.
    const camPos = halfAuFrom(SIRIUS.positionMpc);
    const view = makeNear0View(camPos);
    const state = makeState(renderer, [SUN, PROXIMA, SIRIUS]);

    starPointsLayer.draw(PASS_STUB, view, makeCtx(camPos), state);

    expect(renderer.setStars).toHaveBeenCalledTimes(1);
    expect(renderer.setStars.mock.calls[0]![0].map((star) => star.id)).toEqual([
      SUN.id,
      PROXIMA.id,
    ]);
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
      SUN.id,
      PROXIMA.id,
      SIRIUS.id,
    ]);

    // The camera closes on Sirius: it resolves, so it must LEAVE the
    // uploaded point set — otherwise it would draw as point AND sphere. The
    // Sun and Proxima stay points (parsecs away, sub-pixel).
    const nearCam = halfAuFrom(SIRIUS.positionMpc);
    starPointsLayer.draw(PASS_STUB, makeNear0View(nearCam), makeCtx(nearCam), state);
    expect(renderer.setStars).toHaveBeenCalledTimes(3);
    expect(renderer.setStars.mock.calls[2]![0].map((star) => star.id)).toEqual([
      SUN.id,
      PROXIMA.id,
    ]);
    expect(renderer.draw).toHaveBeenCalledTimes(3);
  });

  it('premultiplies each uploaded colour by the backdrop-dissolve alpha', () => {
    // Camera parked mid-band (between the starBackdrop fullAt and goneAt edges),
    // where the dissolve alpha is a genuine fraction — the pin that fails if the
    // scale is dropped (colours upload at full strength) or inverted. From ~14
    // kpc every seeded star is a sub-pixel point, so the whole roster uploads.
    const camDistMpc =
      (SCALE_FADE_BANDS.starBackdrop.fullAt + SCALE_FADE_BANDS.starBackdrop.goneAt) / 2;
    const expectedFade = fadeBand(SCALE_FADE_BANDS.starBackdrop, camDistMpc);
    expect(expectedFade).toBeGreaterThan(0);
    expect(expectedFade).toBeLessThan(1);

    const renderer = makeRenderer();
    const camPos: Vec3 = [0, 0, camDistMpc];
    const state = makeState(renderer, [SUN, PROXIMA, SIRIUS]);
    starPointsLayer.draw(PASS_STUB, makeNear0View(camPos), makeCtx(camPos), state);

    const uploaded = renderer.setStars.mock.calls[0]![0];
    const uploadedProxima = uploaded.find((star) => star.id === PROXIMA.id)!;
    expect(uploadedProxima.color).toEqual([
      PROXIMA.color[0] * expectedFade,
      PROXIMA.color[1] * expectedFade,
      PROXIMA.color[2] * expectedFade,
    ]);
    // Distinctly NOT the raw colour — the scale actually happened.
    expect(uploadedProxima.color).not.toEqual([...PROXIMA.color]);
  });

  it('hands the renderer the sizePx slider and brightness × exposure-ramp factor', () => {
    // Camera parked mid-band so the roster uploads and the exposure ramp is a
    // genuine non-trivial factor. The layer must forward `starCatalogs.sizePx`
    // verbatim and `brightness × starExposureRamp(camDistMpc, near, mid, far)` —
    // the SAME fold `starCatalogLayer` applies — NOT the raw brightness trim.
    const camDistMpc =
      (SCALE_FADE_BANDS.starBackdrop.fullAt + SCALE_FADE_BANDS.starBackdrop.goneAt) / 2;
    const renderer = makeRenderer();
    const camPos: Vec3 = [0, 0, camDistMpc];
    const state = makeState(renderer, SCENE_STARS);

    starPointsLayer.draw(PASS_STUB, makeNear0View(camPos), makeCtx(camPos), state);

    const opts = renderer.draw.mock.calls[0]![3];
    const expectedBrightness =
      STAR_CATALOG_SETTINGS.brightness *
      starExposureRamp(
        camDistMpc,
        STAR_CATALOG_SETTINGS.exposureNearX,
        STAR_CATALOG_SETTINGS.exposureMidX,
        STAR_CATALOG_SETTINGS.exposureFarX,
      );
    expect(opts.sizePx).toBe(STAR_CATALOG_SETTINGS.sizePx);
    expect(opts.brightness).toBeCloseTo(expectedBrightness, 12);
    // The ramp actually bent the trim — a raw-brightness bug would fail here.
    expect(opts.brightness).not.toBeCloseTo(STAR_CATALOG_SETTINGS.brightness, 6);
  });

  it('uploads ONLY the Sun when the famous-stars gate is off', () => {
    // Mid-band camera so the layer draws; the seed is the full roster but the
    // famousStars master gate is OFF — the star layers fall back to the Sun
    // alone (its map is muted, the descent's aim point kept). The Sun is
    // parsecs-sub-pixel here, so it rides the point branch.
    const camDistMpc =
      (SCALE_FADE_BANDS.starBackdrop.fullAt + SCALE_FADE_BANDS.starBackdrop.goneAt) / 2;
    const renderer = makeRenderer();
    const camPos: Vec3 = [0, 0, camDistMpc];
    const state = makeState(renderer, SCENE_STARS, false);

    starPointsLayer.draw(PASS_STUB, makeNear0View(camPos), makeCtx(camPos), state);

    expect(renderer.setStars).toHaveBeenCalledTimes(1);
    expect(renderer.setStars.mock.calls[0]![0].map((star) => star.id)).toEqual([SUN.id]);
  });

  it('is a no-op when the starPointRenderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View([0, 0, 5]);
    const state = { gpu: { starPointRenderer: null } } as unknown as EngineState;
    expect(() => starPointsLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });
});
