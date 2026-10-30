/**
 * starPointsPass — the point-partition star content row.
 *
 * f64 rebase seam: point anchors and the NEAR0 view translation are near-equal
 * parsec-scale numbers on final approach to a star, so an f32 subtraction cancels
 * catastrophically. The layer must hand CAMERA-RELATIVE positions (pos - camPos in f64)
 * with the REBASED view-projection, not raw anchors through the f32 `view.vp`.
 * Membership: `setStars` gets EXACTLY the `unresolved` stars of core's scene-body sort,
 * per frame (no cache), so a promoted star never draws as point AND sphere.
 */

import { describe, it, expect, vi } from 'vitest';
import { mat4 } from 'wgpu-matrix';

import { starPointsPass } from '../../../../src/layers/starCatalog/passes/starPointsPass';
import { gateOrbitTrailGroup } from '../../../../src/services/engine/layer/gateOrbitTrailGroup';
import { gatePassByFade } from '../../../../src/services/engine/layer/gatePassByFade';
import { APP_VISIBILITY_REGISTRY } from '../../../../src/compositions/appVisibility';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes/index';
import type { StarCatalogRuntime } from '../../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import { FRAME_ORDER } from '../../../../src/services/engine/frame/frameOrder';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/data/rendering/foregroundMaxDistance';
import { rebaseViewProj } from '../../../../src/utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../src/utils/math/narrowMat4';
import { starExposureRamp } from '../../../../src/utils/star/starExposureRamp';
import { SEEDED_STAR_CATALOGS } from '../../../../src/data/bodies/seededStarCatalogs';
import { GALACTIC_CENTRE_ANCHOR } from '../../../../src/data/places/galacticCentre';
import { SCENE_S_STARS } from '../../../../src/data/bodies/sceneSStars';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { positionedSeededStars } from '../../../../src/layers/starCatalog/present/positionedSeededStars';
import { distanceMpc } from '../../../../src/utils/math/distanceMpc';
import { projectToScreenPx } from '../../../../src/utils/camera/projectToScreenPx';
import { FAMOUS_STAR_PICK_RADIUS_PX } from '../../../../src/data/famousStarPickRadiusPx';
import { Source } from '../../../../src/data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../src/data/selectionEncoding';
import { makeBodyItems } from '../../../fixtures/makeBodyItems';
import { makeSlab } from '../../../fixtures/makeSlab';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { ZERO_FOCUS } from '../../../../src/services/engine/subsystems/structureFocusSubsystem';
import type { FocusUniformsValue } from '../../../../src/@types/rendering/FocusUniformsValue';
import { NEAR0 } from '../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { SeededStarCatalogId } from '../../../../src/@types/data/starCatalog/SeededStarCatalogId';
import type { StarCatalogSettings } from '../../../../src/@types/settings/StarCatalogSettings';
import type { PositionedStar } from '../../../../src/@types/scene/PositionedStar';
import type { PositionedSceneBody } from '../../../../src/@types/engine/frame/PositionedSceneBody';
import type { Vec2 } from '../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const ALL_ON = { famousStar: 1, gaiaStars: 1, sStar: 1, sun: 1 } as const;

// Non-default values so the ramp fold is observable (a raw-brightness bug would show).
const STAR_CATALOG_SETTINGS = {
  sizePx: 3.25,
  brightness: 0.8,
  exposureNearX: 15,
  exposureMidX: 57,
  exposureFarX: 70,
} as unknown as StarCatalogSettings;

type Catalogs = Partial<Record<SeededStarCatalogId, boolean>>;
const MAP_AND_SUN: Catalogs = { famousStar: true, sun: true };
const EVERY_SEEDED: Catalogs = { famousStar: true, sun: true, sStar: true };

const STATES = deriveBodyStates(CONST_J2000);
function sceneBodiesOf(catalogs: Catalogs): readonly PositionedSceneBody[] {
  return (Object.keys(SEEDED_STAR_CATALOGS) as SeededStarCatalogId[])
    .filter((id) => catalogs[id] === true)
    .flatMap((id) => SEEDED_STAR_CATALOGS[id])
    .map((body) => ({ body, positionMpc: STATES.get(body.id)!.positionMpc }));
}
const ALL_STARS = positionedSeededStars(sceneBodiesOf(EVERY_SEEDED));
const positioned = (id: string): PositionedStar => ALL_STARS.find((s) => s.id === id)!;

const packedIdOf = (star: PositionedStar): number =>
  packSelection(star.source, star.seedIndex + PICK_SENTINEL_OFFSET);

const SUN = positioned('sun');
const PROXIMA = positioned('proxima-centauri');
const SIRIUS = positioned('sirius');

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

// |camPos| is the orbit distance (fixtures orbit the heliocentric origin); 60° fov and the
// 720-px viewport match the SlabView below.
const FIXTURE_PX_PER_RAD = 720 / (2 * Math.tan(Math.PI / 3 / 2));

function makeCtx(
  camPos: Readonly<Vec3>,
  focus: FocusUniformsValue = ZERO_FOCUS,
  catalogs: Catalogs = MAP_AND_SUN,
): FrameView {
  return {
    snapshot: {
      simDays: CONST_J2000,
      nowMs: 0,
      bodyStates: STATES,
      focus,
      sceneBodies: sceneBodiesOf(catalogs),
    },
    drawCamPos: camPos,
    drawPxPerRad: FIXTURE_PX_PER_RAD,
  } as unknown as FrameView;
}

// A camera 5 kpc down +z, parsecs beyond every seeded star, so all 24 non-Sun neighbours
// stay sub-pixel points.
const NEAR_FIELD_CAM: Readonly<Vec3> = [0, 0, 5e-3];

// 14 kpc out: every seeded star is a sub-pixel point, so the whole roster uploads, and the
// exposure ramp is a genuine fraction there.
const ROSTER_CAM_DISTANCE_MPC = 0.014;

// Within MAX_ORBIT_EXTENT_MPC of the origin (Neptune's ~30 AU is ~1.5e-10 Mpc), so
// orbitTrailsPass's sub-pixel bound treats every orbit as visible. NEAR_FIELD_CAM (5 kpc) is
// far too distant for the group assertion that needs star-points AND orbit-trails enabled.
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
  const slab: Slab = makeSlab({ vp: f64Vp });
  return {
    slab,
    vp: f32Vp,
    camPos,
    viewportPx: [1280, 720],
    window: { originPx: [0, 0], sizePx: [1280, 720] },
  };
}

function makeRenderer() {
  return {
    setStars: vi.fn<(stars: readonly PositionedStar[]) => void>(),
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

function makeState(): EngineState {
  return {
    gpu: { bodyPickRenderer: { drawPoints: vi.fn() } },
    settings: { starCatalogs: STAR_CATALOG_SETTINGS, bodies: { items: makeBodyItems() } },
  } as unknown as EngineState;
}

function makeRuntime(starPointRenderer: unknown): StarCatalogRuntime {
  return { starPointRenderer } as unknown as StarCatalogRuntime;
}

// `enabled` never reads `view` — an arbitrary NEAR0 view satisfies the 3-arg
// signature for every gating case in this file.
const VIEW_STUB = makeNear0View([0, 0, 0]);

describe('starPointsPass.enabled', () => {
  it('is false once every star resolves; true with a point star', () => {
    const renderer = makeRenderer();
    const pass = starPointsPass(makeRuntime(renderer));
    const onSunCtx = makeCtx(halfAuFrom(SUN.positionMpc), ZERO_FOCUS, { sun: true });
    expect(pass.enabled(makeState(), onSunCtx, VIEW_STUB, ALL_ON)).toBe(false);
    const nearCtx = makeCtx(NEAR_FIELD_CAM);
    expect(pass.enabled(makeState(), nearCtx, VIEW_STUB, ALL_ON)).toBe(true);
  });

  it('is disabled while every seeded set hands 0, even with point stars present', () => {
    // The survey item keeps the catalog's value above 0, so core's own zero gate never fires.
    const pass = starPointsPass(makeRuntime(makeRenderer()));
    const seededOff = { famousStar: 0, gaiaStars: 1, sStar: 0, sun: 0 } as const;
    expect(pass.enabled(makeState(), makeCtx(NEAR_FIELD_CAM), VIEW_STUB, seededOff)).toBe(false);
  });
});

describe('the (hdr, NEAR0) render group above the foreground gate', () => {
  it('empties above the gate and is non-empty below it (the wholesale-skip property)', () => {
    // The group filter executeFrame applies over the early (hdr, NEAR0) step; above the gate
    // it must be empty (not just the (foreground:0, NEAR0) body group) for the skip to be wholesale.
    // Both rows yield through their entries' bands, resolved here over the real entries with
    // every fade at 1.
    const gateState = {
      visibilityEntries: APP_VISIBILITY_REGISTRY,
      subsystems: {
        fades: { opacityOf: () => 1 },
        clipPlayer: { clipOpacityOf: () => 1 },
      },
    } as unknown as EngineState;
    const pointsPass = gatePassByFade(starPointsPass(makeRuntime(makeRenderer())), gateState);
    const state = {
      gpu: {
        orbitTrailRenderer: { draw: vi.fn() },
      },
      // The milky-way impostor and constellation overlay ride this group but their visibility
      // windows are far wider than the foreground gate, so they are toggled off to pin the STAR
      // rows' skip. orbit-trails' enabled() reads the visibility intent and `orbitTrailGroups`,
      // so the fixture carries both.
      settings: {
        milkyWay: { enabled: false },
        starCatalogs: STAR_CATALOG_SETTINGS,
        bodies: { items: makeBodyItems() },
        constellations: { enabled: false, intensity: 1 },
        orbitTrails: { enabled: true },
        missionTrails: { enabled: false },
      },
      orbitTrailGroups: [gateOrbitTrailGroup({ show: 'orbitTrails', rows: [] }, gateState)],
      subsystems: { fades: { opacityOf: () => 0 } },
    } as unknown as EngineState;
    const hdrNear0 = FRAME_ORDER.flatMap((step) =>
      step.kind === 'render' && step.target === 'hdr' && step.slab === NEAR0 ? step.passes : [],
    );
    const roster = [pointsPass, ...CONTENT_PASSES];
    const groupAt = (ctx: FrameView) =>
      roster.filter((pass) => hdrNear0.includes(pass.name) && pass.enabled(state, ctx, VIEW_STUB));

    // Below the gate the point backdrop and the rings both draw. NEAR_ORBIT_CAM, not
    // NEAR_FIELD_CAM: orbit-trails also needs the camera within MAX_ORBIT_EXTENT_MPC.
    expect(groupAt(makeCtx(NEAR_ORBIT_CAM)).map((l) => l.name)).toEqual([
      'star-points',
      'orbit-trails',
    ]);
    expect(groupAt(makeCtx([0, 0, FOREGROUND_MAX_DISTANCE_MPC]))).toEqual([]);
    expect(groupAt(makeCtx([0, 0, FOREGROUND_MAX_DISTANCE_MPC * 10]))).toEqual([]);
  });
});

describe('starPointsPass.draw', () => {
  it('threads the REBASED vp (not the raw f32 view.vp) and view.viewportPx to draw', () => {
    const renderer = makeRenderer();
    const pass = starPointsPass(makeRuntime(renderer));
    const camPos: Vec3 = [0, 0, 5];
    const view = makeNear0View(camPos);
    const state = makeState();

    pass.draw!(PASS_STUB, view, makeCtx(camPos), state, ALL_ON);

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
    const camPos: Vec3 = [0, 0, 5];
    const view = makeNear0View(camPos);
    const state = makeState();

    starPointsPass(makeRuntime(renderer)).draw!(PASS_STUB, view, makeCtx(camPos), state, ALL_ON);

    const uploaded = renderer.setStars.mock.calls[0]![0];
    expect(uploaded.map((star) => star.id)).toEqual(
      expect.arrayContaining([SUN.id, PROXIMA.id, SIRIUS.id]),
    );
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

  it('starPointsPass draws only the point stars', () => {
    const renderer = makeRenderer();
    // Mixed fixture, camera half an AU off Sirius: only Sirius resolves
    // (1.71 R☉) and belongs to starSpheresPass — its suite asserts exactly
    // that set over this same fixture — leaving the Sun and Proxima (parsecs
    // out, sub-pixel: a point is what keeps them VISIBLE from here) as the
    // point stars. Disjoint + covering by construction: the structural XOR.
    const camPos = halfAuFrom(SIRIUS.positionMpc);
    const view = makeNear0View(camPos);
    const state = makeState();

    starPointsPass(makeRuntime(renderer)).draw!(PASS_STUB, view, makeCtx(camPos), state, ALL_ON);

    expect(renderer.setStars).toHaveBeenCalledTimes(1);
    const uploadedIds = renderer.setStars.mock.calls[0]![0].map((star) => star.id);
    expect(uploadedIds).toEqual(expect.arrayContaining([SUN.id, PROXIMA.id]));
    expect(uploadedIds).not.toContain(SIRIUS.id);
    expect(renderer.draw).toHaveBeenCalledTimes(1);
  });

  it('re-uploads every frame (rebased anchors) and drops a star the frame it resolves', () => {
    const renderer = makeRenderer();
    const pass = starPointsPass(makeRuntime(renderer));
    const state = makeState();

    const farCam: Vec3 = [0, 0, 5];
    pass.draw!(PASS_STUB, makeNear0View(farCam), makeCtx(farCam), state, ALL_ON);
    pass.draw!(PASS_STUB, makeNear0View(farCam), makeCtx(farCam), state, ALL_ON);
    expect(renderer.setStars).toHaveBeenCalledTimes(2);
    expect(renderer.setStars.mock.calls[0]![0].map((star) => star.id)).toContain(SIRIUS.id);

    const nearCam = halfAuFrom(SIRIUS.positionMpc);
    pass.draw!(PASS_STUB, makeNear0View(nearCam), makeCtx(nearCam), state, ALL_ON);
    expect(renderer.setStars).toHaveBeenCalledTimes(3);
    const afterClose = renderer.setStars.mock.calls[2]![0].map((star) => star.id);
    expect(afterClose).toEqual(expect.arrayContaining([SUN.id, PROXIMA.id]));
    expect(afterClose).not.toContain(SIRIUS.id);
    expect(renderer.draw).toHaveBeenCalledTimes(3);
  });

  it('dims stars outside the focus sphere and leaves the focused one at full strength', () => {
    const camPos: Vec3 = [0, 0, ROSTER_CAM_DISTANCE_MPC];
    const focus: FocusUniformsValue = {
      center: PROXIMA.positionMpc,
      apparentRadiusMpc: 1e-6,
      physicalRadiusMpc: 1e-7,
      blend: 1,
    };
    const renderer = makeRenderer();
    starPointsPass(makeRuntime(renderer)).draw!(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(camPos, focus),
      makeState(),
      ALL_ON,
    );
    const uploaded = renderer.setStars.mock.calls[0]![0];
    const colorOf = (id: string) => uploaded.find((star) => star.id === id)!.color;
    expect(colorOf(PROXIMA.id)[0]).toBeCloseTo(PROXIMA.color[0], 12);
    expect(colorOf(SIRIUS.id)[0]).toBeCloseTo(SIRIUS.color[0] * 0.08, 12);
  });

  it("star points scale their colour by their catalog's value", () => {
    const camPos: Vec3 = [0, 0, ROSTER_CAM_DISTANCE_MPC];
    const colourOf = (fade: Record<keyof typeof ALL_ON, number>, id: string) => {
      const renderer = makeRenderer();
      starPointsPass(makeRuntime(renderer)).draw!(
        PASS_STUB,
        makeNear0View(camPos),
        makeCtx(camPos),
        makeState(),
        fade,
      );
      return renderer.setStars.mock.calls[0]![0].find((star) => star.id === id)!.color;
    };
    const halfFamous = { ...ALL_ON, famousStar: 0.5 };

    const famousFull = colourOf(ALL_ON, PROXIMA.id);
    const famousHalf = colourOf(halfFamous, PROXIMA.id);
    expect(famousFull[0]).toBeGreaterThan(0);
    expect(famousHalf).toEqual(famousFull.map((c) => c * 0.5));
    expect(colourOf(halfFamous, SUN.id)).toEqual(colourOf(ALL_ON, SUN.id));
  });

  it('hands the renderer the sizePx slider and brightness × exposure-ramp factor', () => {
    // The layer must forward `starCatalogs.sizePx`
    // verbatim and `brightness × starExposureRamp(camDistMpc, near, mid, far)` —
    // the SAME fold `starCatalogPass` applies — NOT the raw brightness trim.
    const camDistMpc = ROSTER_CAM_DISTANCE_MPC;
    const renderer = makeRenderer();
    const camPos: Vec3 = [0, 0, camDistMpc];
    const state = makeState();

    starPointsPass(makeRuntime(renderer)).draw!(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(camPos),
      state,
      ALL_ON,
    );

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
    expect(opts.brightness).not.toBeCloseTo(STAR_CATALOG_SETTINGS.brightness, 6);
  });

  it('uploads only the stars core admitted', () => {
    const camDistMpc = ROSTER_CAM_DISTANCE_MPC;
    const renderer = makeRenderer();
    const camPos: Vec3 = [0, 0, camDistMpc];
    const state = makeState();

    starPointsPass(makeRuntime(renderer)).draw!(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(camPos, ZERO_FOCUS, { sun: true }),
      state,
      ALL_ON,
    );

    expect(renderer.setStars).toHaveBeenCalledTimes(1);
    expect(renderer.setStars.mock.calls[0]![0].map((star) => star.id)).toEqual([SUN.id]);
  });
});

/**
 * A satellite inside the Galactic Centre's click target (the blackHoles Layer's
 * marker stamp) is not stamped here, or one S-star would win the centre pixel
 * and steal the hole's click. The rule is a screen-separation fact scoped to
 * the anchor's own region.
 */
describe('the Galactic Centre footprint exclusion', () => {
  // A camera sitting on the anchor: the caption's own distance is ~0, so the
  // approach band reads full.
  const AT_GALACTIC_CENTRE = GALACTIC_CENTRE_ANCHOR.positionMpc as Vec3;
  // Displaced far enough that the whole S-star cluster still collapses inside
  // one pick footprint, but the anchor's caption is at full alpha.
  const NEAR_GALACTIC_CENTRE: Vec3 = [
    AT_GALACTIC_CENTRE[0] + 1e-5,
    AT_GALACTIC_CENTRE[1],
    AT_GALACTIC_CENTRE[2],
  ];
  // Close enough that S2's ~1000 AU orbit spans far more than the footprint.
  const INSIDE_THE_CLUSTER: Vec3 = [
    AT_GALACTIC_CENTRE[0] + 1e-7,
    AT_GALACTIC_CENTRE[1],
    AT_GALACTIC_CENTRE[2],
  ];

  /** A NEAR0 view with a REAL perspective·lookAt vp aimed at the anchor: under the synthetic
   *  counting matrix every point lands on one pixel and the cluster suppresses at any zoom,
   *  so the test would pass for the wrong reason. */
  const makeProjectedView = (camPos: Vec3): SlabView => {
    const eyeToAnchor = distanceMpc(camPos, AT_GALACTIC_CENTRE);
    const view = mat4.lookAt(camPos, AT_GALACTIC_CENTRE, [0, 1, 0]);
    const proj = mat4.perspective(Math.PI / 3, 1280 / 720, eyeToAnchor / 100, eyeToAnchor * 100);
    const vp = Float64Array.from(mat4.multiply(proj, view));
    return { ...makeNear0View(camPos), slab: { ...makeNear0View(camPos).slab, vp } };
  };

  const stampedIds = (catalogs: Catalogs, camPos: Vec3, view = makeNear0View(camPos)): number[] => {
    const state = makeState();
    const pass = starPointsPass(makeRuntime(makeRenderer()));
    pass.drawPick!(PASS_STUB, view, makeCtx(camPos, ZERO_FOCUS, catalogs), state, ALL_ON);
    const renderer = state.gpu.bodyPickRenderer as unknown as {
      drawPoints: ReturnType<typeof vi.fn>;
    };
    const { points } = renderer.drawPoints.mock.calls[0]![1] as { points: { packedId: number }[] };
    return points.map((point) => point.packedId);
  };

  const sStarIdsIn = (stamped: readonly number[]): string[] =>
    SCENE_S_STARS.filter((star, seedIndex) =>
      stamped.includes(packSelection(Source.SStar, seedIndex + PICK_SENTINEL_OFFSET)),
    ).map((star) => star.id);

  it('an S-star inside the galactic-centre footprint is not stamped', () => {
    const zoomedOut = stampedIds(
      EVERY_SEEDED,
      NEAR_GALACTIC_CENTRE,
      makeProjectedView(NEAR_GALACTIC_CENTRE),
    );
    expect(sStarIdsIn(zoomedOut)).toEqual([]);

    const zoomedIn = stampedIds(
      EVERY_SEEDED,
      INSIDE_THE_CLUSTER,
      makeProjectedView(INSIDE_THE_CLUSTER),
    );
    expect(sStarIdsIn(zoomedIn).length).toBeGreaterThan(0);
  });

  it('does not stamp a star the focus has dimmed, and still stamps the focused one', () => {
    const focus: FocusUniformsValue = {
      center: PROXIMA.positionMpc,
      apparentRadiusMpc: 1e-6,
      physicalRadiusMpc: 1e-7,
      blend: 1,
    };
    const camPos: Vec3 = [0, 0, 5e-3];
    const state = makeState();
    starPointsPass(makeRuntime(makeRenderer())).drawPick!(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(camPos, focus),
      state,
      ALL_ON,
    );
    const renderer = state.gpu.bodyPickRenderer as unknown as {
      drawPoints: ReturnType<typeof vi.fn>;
    };
    const { points } = renderer.drawPoints.mock.calls[0]![1] as { points: { packedId: number }[] };
    const stamped = points.map((point) => point.packedId);
    expect(stamped).toContain(packedIdOf(PROXIMA));
    expect(stamped).not.toContain(packedIdOf(SIRIUS));
    expect(stamped).not.toContain(packedIdOf(SUN));
  });

  it('leaves a famous star that merely lines up with the anchor clickable', () => {
    // A vantage BEHIND Sirius on the line through the anchor, so the two project
    // onto the same pixel — the exact overlap the footprint rule reacts to.
    // Sirius is a different object at a different distance, in another region,
    // and must keep its click; a rule scoped to the footprint alone rather than
    const behindSirius: Vec3 = [
      SIRIUS.positionMpc[0] + 0.5 * (SIRIUS.positionMpc[0] - AT_GALACTIC_CENTRE[0]),
      SIRIUS.positionMpc[1] + 0.5 * (SIRIUS.positionMpc[1] - AT_GALACTIC_CENTRE[1]),
      SIRIUS.positionMpc[2] + 0.5 * (SIRIUS.positionMpc[2] - AT_GALACTIC_CENTRE[2]),
    ];
    const view = makeProjectedView(behindSirius);
    const stamped = stampedIds(EVERY_SEEDED, behindSirius, view);

    const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, view.camPos));
    const screenOf = (posMpc: Readonly<Vec3>) =>
      projectToScreenPx(
        [
          posMpc[0] - view.camPos[0],
          posMpc[1] - view.camPos[1],
          posMpc[2] - view.camPos[2],
        ] as Vec3,
        rebasedVp,
        view.viewportPx,
      )!;
    const [ax, ay] = screenOf(AT_GALACTIC_CENTRE);
    const [sx, sy] = screenOf(SIRIUS.positionMpc);
    expect(Math.hypot(sx - ax, sy - ay)).toBeLessThan(FAMOUS_STAR_PICK_RADIUS_PX);

    expect(stamped).toContain(packedIdOf(SIRIUS));
  });
});
