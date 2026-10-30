/**
 * bodyGlintsPass — the sub-pixel body glint content row. Pinned: the zero-brightness skip
 * (`feedback_opacity_zero_no_render`: an unlit far-side body is NOT packed, a mid-fade LIT one is,
 * brightness strictly in (0, 1)) and the f64 rebase seam (the renderer gets CAMERA-RELATIVE
 * anchors paired with the REBASED view-projection, not raw anchors through the f32 `view.vp`).
 * Fixtures sit on the +x axis so apparent-size regime and phase are unambiguous rather than
 * round numbers a unit bug could accidentally satisfy.
 */

import { positionedBodiesOf } from '../../../helpers/frame/positionedBodiesOf';
import { describe, it, expect, vi } from 'vitest';

import { bodyGlintsPass } from '../../../../src/layers/body/passes/bodyGlintsPass';
import { BODY_GLINT_INSTANCE_FLOATS as INSTANCE_FLOATS } from '../../../../src/data/rendering/bodyGlintInstanceFloats';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/data/rendering/foregroundMaxDistance';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../../../../src/data/labels/solarSystemLabelMaxDistance';
import { SCALE_FADE_BANDS } from '../../../../src/data/scaleFadeBands';
import { fadeBand } from '../../../../src/utils/math/fadeBand';
import { rebaseViewProj } from '../../../../src/utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../src/utils/math/narrowMat4';
import { Source } from '../../../../src/data/source';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../src/data/selectionEncoding';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { BodyRuntime } from '../../../../src/layers/body/@types/BodyRuntime';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import { sceneBodyStates } from '../../../../src/services/engine/frame/sceneBodyStates';
import { seededBodyStates } from '../../../helpers/frame/seededBodyStates';
import type { SceneBody } from '../../../../src/@types/scene/SceneBody';
import type { PlanetBody } from '../../../../src/@types/scene/PlanetBody';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';

// `makeCtx` pins the body-state snapshot to the fixture bodies, reusing each record's own
// refs so the `toBe(...)` assertions hold.
vi.mock('../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn(),
}));

type SeededPlanet = PlanetBody & Pick<BodyState, 'positionMpc' | 'orientation'>;

const KM = SCALE_UNITS.KM_TO_MPC;
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1] as SeededPlanet['orientation'];

// Camera 1e6 km down +x from the Sun (at the origin) — deep inside the
// solar-system label cutoff, so the glint backdrop fade is fully on.
const CAM_KM = 1_000_000;
const CAM_POS: Vec3 = [CAM_KM * KM, 0, 0];

/**
 * A body on the +x axis at `posKm` km from the Sun. With the
 * camera 1e6 km out and both bodies 1e5 km from it, a 160 km radius subtends
 * ~2 px — a mid-fade glint (sub-3 px, so in the glints branch; above 1 px, so
 * the cross-fade is partial). A body FARTHER from the Sun than the camera is lit
 * (camera on the sunlit side); one CLOSER than the camera shows its unlit far
 * side (camera beyond it along the sun ray).
 */
function bodyAt(id: string, posKm: number, albedo: Vec3): SeededPlanet {
  return {
    id: asSceneBodyId(id),
    label: id,
    positionMpc: [posKm * KM, 0, 0],
    resolvePx: 3,
    surface: { datumRadiusM: 160000, reliefM: [0, 0] },
    albedo,
    orientation: IDENTITY,
  };
}

// Real `SCENE_PLANETS` ids: core takes its own bodies by id (`coreSceneBodyIds`).
// LIT: 1.1e6 km out (farther than the camera) → camera between Sun and body →
// full phase. Mid-fade size, bright albedo.
const LIT = bodyAt('saturn', 1_100_000, [0.8, 0.8, 0.8]);
// UNLIT: 0.9e6 km out (closer than the camera) → camera beyond it along the sun
// ray → new phase, illuminated fraction 0 → zero brightness → skipped.
const UNLIT = bodyAt('neptune', 900_000, [0.8, 0.8, 0.8]);

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

// 720-px viewport, 60° fovY, tangent-exact.
const FIXTURE_PX_PER_RAD = 720 / (2 * Math.tan(Math.PI / 3 / 2));

function makeCtx(
  camPos: Readonly<Vec3>,
  planets: readonly SeededPlanet[],
  meshBodies: readonly SceneBody[] = [],
  earth?: SeededPlanet,
): FrameView {
  vi.mocked(sceneBodyStates).mockReturnValue(
    seededBodyStates(0, earth ? [...planets, earth] : planets),
  );
  return {
    snapshot: { meshBodies, sceneBodies: positionedBodiesOf([...planets, ...meshBodies]) },
    cam: { distance: Math.hypot(camPos[0], camPos[1], camPos[2]) },
    drawCamPos: camPos,
    drawPxPerRad: FIXTURE_PX_PER_RAD,
  } as unknown as FrameView;
}

/** A SlabView whose f64 `slab.vp` and f32 `vp` are deliberately DIFFERENT
 *  arrays, so identity checks reveal which one the layer threads. */
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
    draw: vi.fn<
      (
        pass: GPURenderPassEncoder,
        instances: Float32Array,
        count: number,
        viewProj: Float32Array,
        viewportPx: readonly [number, number],
      ) => void
    >(),
  };
}

const STATE = { gpu: {} } as unknown as EngineState;

/** The pass over a runtime holding `renderer`; no surface map is resident (the
 *  glints branch is decided by apparent size before residency anyway). */
function glintsWith(renderer: unknown) {
  return bodyGlintsPass({
    bodyGlintRenderer: renderer,
    texturedBodyRenderer: { hasMap: () => false },
  } as unknown as BodyRuntime);
}

const GLINTS = glintsWith(makeRenderer());

describe('bodyGlintsPass.enabled', () => {
  it('is true with a sub-pixel body inside the backdrop band', () => {
    expect(GLINTS.enabled(STATE, makeCtx(CAM_POS, [LIT, UNLIT]), makeNear0View(CAM_POS))).toBe(
      true,
    );
  });
});

describe('bodyGlintsPass.enabled — far dissolve (the bite)', () => {
  it('stays on mid-dissolve but LEAVES the pass plan past the backdrop goneAt while still inside the foreground gate', () => {
    // `bodyGlint` only has a NEAR handoff (3→1 px), so without the `bodyGlintBackdrop`
    // far-dissolve the glints draw at full brightness out to the coarse foreground gate, all ~22
    // collapsing onto one dot. Once the band zeroes the layer must LEAVE the pass plan.
    const backdrop = SCALE_FADE_BANDS.bodyGlintBackdrop;
    const dMid = (backdrop.fullAt + backdrop.goneAt) / 2; // mid fade → band in (0,1)
    const dGone = backdrop.goneAt * 2; // past goneAt → band 0
    expect(dGone).toBeLessThan(FOREGROUND_MAX_DISTANCE_MPC);
    expect(fadeBand(backdrop, dMid)).toBeGreaterThan(0);
    expect(fadeBand(backdrop, dGone)).toBe(0);

    // One body a hair off the Sun: deeply sub-pixel from BOTH cameras (each is
    // astronomically farther out), so it sits in the glints branch either way and
    // the far-dissolve band is the sole thing that flips `enabled`.
    const glint = bodyAt('mars', 1, [0.6, 0.32, 0.23]);

    expect(GLINTS.enabled(STATE, makeCtx([dMid, 0, 0], [glint]), makeNear0View(CAM_POS))).toBe(
      true,
    );
    expect(GLINTS.enabled(STATE, makeCtx([dGone, 0, 0], [glint]), makeNear0View(CAM_POS))).toBe(
      false,
    );
  });
});

describe('bodyGlintsPass.draw — far-dissolve brightness scaling', () => {
  it('scales the packed glint brightness by the backdrop band (identical geometry, only camera-origin distance differs)', () => {
    // Two cameras at DIFFERENT origin distances, the body pinned the SAME small offset beyond
    // each: camera→body geometry (size, phase) is identical, so only the far-dissolve band (keyed on
    // camera-origin distance) can change the packed brightness; a missing backdrop multiply would
    // leave the two equal.
    const backdrop = SCALE_FADE_BANDS.bodyGlintBackdrop;
    const OFF = 1e5 * KM; // ~2 px glint at radius 160 km, like the LIT fixture
    const dFull = backdrop.fullAt * 0.5; // full band → backdrop 1
    const dMid = (backdrop.fullAt + backdrop.goneAt) / 2; // mid fade → backdrop in (0,1)
    expect(fadeBand(backdrop, dFull)).toBe(1);
    const midFade = fadeBand(backdrop, dMid);
    expect(midFade).toBeGreaterThan(0);
    expect(midFade).toBeLessThan(1);

    const brightnessAt = (camX: number): number => {
      const camPos: Vec3 = [camX, 0, 0];
      const body: SeededPlanet = {
        id: asSceneBodyId('jupiter'),
        label: 'jupiter',
        positionMpc: [camX + OFF, 0, 0], // just beyond the camera → lit, ~2 px glint
        resolvePx: 3,
        surface: { datumRadiusM: 160000, reliefM: [0, 0] },
        albedo: [0.8, 0.8, 0.8],
        orientation: IDENTITY,
      };
      const renderer = makeRenderer();
      glintsWith(renderer).draw(PASS_STUB, makeNear0View(camPos), makeCtx(camPos, [body]), STATE);
      const [, instances, count] = renderer.draw.mock.calls[0]!;
      expect(count).toBe(1);
      return instances[6]!;
    };

    const full = brightnessAt(dFull);
    const mid = brightnessAt(dMid);
    expect(mid).toBeLessThan(full);
    expect(mid).toBeCloseTo(full * midFade, 12);
  });
});

describe('bodyGlintsPass.pickEnabled (Bug B — Earth-stamp-only frame stays in the pick pass)', () => {
  // With NO glints `enabled` is false, but the Earth caption stamp still rides this layer's pick
  // pass, so the pick gate is WIDER than the draw gate: glints present OR Earth within caption range.
  const earthWithinGate: SeededPlanet = {
    id: asSceneBodyId('earth'),
    label: 'Earth',
    positionMpc: [1_100_000 * KM, 0, 0],
    resolvePx: 3,
    surface: { datumRadiusM: 6371000, reliefM: [0, 0] },
    albedo: [0.2, 0.4, 0.8],
    orientation: IDENTITY,
  };
  const camWithin: Vec3 = [1e-6, 0, 0]; // inside the caption gate
  const camBeyond: Vec3 = [SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC * 2, 0, 0];

  it('is true when Earth is seeded within the caption gate even with an empty glints branch — while enabled is false', () => {
    const view = makeNear0View(camWithin);
    expect(GLINTS.enabled(STATE, makeCtx(camWithin, [], [], earthWithinGate), view)).toBe(false);
    expect(GLINTS.pickEnabled!(STATE, makeCtx(camWithin, [], [], earthWithinGate), view)).toBe(
      true,
    );
  });

  it('is false past the backdrop dissolve outside the caption range, even with glints', () => {
    // Every glint `drawPick` would stamp there has dissolved, so the row has nothing to pick.
    expect(
      GLINTS.pickEnabled!(
        STATE,
        makeCtx(camBeyond, [LIT], [], earthWithinGate),
        makeNear0View(camBeyond),
      ),
    ).toBe(false);
  });

  it('is false beyond the caption gate with no glints', () => {
    expect(
      GLINTS.pickEnabled!(
        STATE,
        makeCtx(camBeyond, [], [], earthWithinGate),
        makeNear0View(camBeyond),
      ),
    ).toBe(false);
  });
});

describe('bodyGlintsPass.draw', () => {
  it('skips the zero-brightness (unlit far side) body and packs only the lit mid-fade one', () => {
    const renderer = makeRenderer();
    const view = makeNear0View(CAM_POS);

    glintsWith(renderer).draw(PASS_STUB, view, makeCtx(CAM_POS, [LIT, UNLIT]), STATE);

    expect(renderer.draw).toHaveBeenCalledTimes(1);
    const [passArg, instances, count, vpArg, viewportArg] = renderer.draw.mock.calls[0]!;
    expect(passArg).toBe(PASS_STUB);
    expect(count).toBe(1);
    // The single packed record's brightness is a strict fraction in (0, 1): the
    // phase term (full phase = 1) × size × albedo × the partial cross-fade.
    const brightness = instances[6]!;
    expect(brightness).toBeGreaterThan(0);
    expect(brightness).toBeLessThan(1);
    // The LIT body survived: its rebased +x anchor is positive (farther from the Sun than the camera).
    expect(instances[0]!).toBeGreaterThan(0);
    expect(instances[0]!).toBeCloseTo(LIT.positionMpc[0] - CAM_POS[0], 20);
    expect(instances.length).toBeGreaterThanOrEqual(INSTANCE_FLOATS);

    // The vp is the f32 narrow of the f64 rebase — NOT the raw f32 view.vp.
    expect(vpArg).not.toBe(view.vp);
    expect(vpArg).toEqual(narrowMat4(rebaseViewProj(view.slab.vp, CAM_POS)));
    expect(viewportArg).toBe(view.viewportPx);
  });

  it('is a no-op when every glint is unlit (nothing packed → no draw)', () => {
    const renderer = makeRenderer();
    glintsWith(renderer).draw(PASS_STUB, makeNear0View(CAM_POS), makeCtx(CAM_POS, [UNLIT]), STATE);
    expect(renderer.draw).not.toHaveBeenCalled();
  });
});

// Real seed ids so `seedIndexOfBody(id, SCENE_PLANETS)` resolves to a stable index. JUPITER sits
// farther from the Sun than the camera (lit), MARS closer (unlit far side, brightness → 0); radius
// 160 km at ~1e5 km keeps both sub-3 px.
const JUPITER = bodyAt('jupiter', 1_100_000, [0.8, 0.8, 0.8]); // SCENE_PLANETS index 3
const MARS = bodyAt('mars', 900_000, [0.6, 0.32, 0.23]); // SCENE_PLANETS index 2, unlit phase
// An id absent from SCENE_PLANETS, as every mesh body's is: seedIndexOfBody returns −1,
// so it is DROPPED (a packed id from −1 would alias body 0).
const UNKNOWN = bodyAt('not-a-planet', 1_050_000, [0.5, 0.5, 0.5]);

function makePickRenderer() {
  return {
    drawSphere: vi.fn(),
    drawPoints: vi.fn<
      (
        pass: GPURenderPassEncoder,
        args: {
          vp: Float32Array;
          viewportPx: readonly [number, number];
          points: readonly { posRelCamMpc: Vec3; packedId: number; bandClass?: number }[];
          variant?: 'sceneStar' | 'glint';
        },
      ) => void
    >(),
  };
}

// A resolved Earth 1.1e6 km down +x — with the camera at 1e6 km its apparent
// diameter is many px, so `earthPass.enabled` (the SAME predicate the Earth
// stamp is gated on) holds and the stamp is emitted.
const EARTH_RESOLVED: SeededPlanet = {
  id: asSceneBodyId('earth'),
  label: 'Earth',
  positionMpc: [1_100_000 * KM, 0, 0],
  resolvePx: 3,
  surface: { datumRadiusM: 6371000, reliefM: [0, 0] },
  albedo: [0.2, 0.4, 0.8],
  orientation: IDENTITY,
};

function makePickState(bodyPickRenderer: unknown): EngineState {
  return { gpu: { bodyPickRenderer } } as unknown as EngineState;
}

describe('bodyGlintsPass.drawPick', () => {
  it('WITHIN the caption gate picks BOTH the lit and the invisible (unlit) glint, dropping unknowns', () => {
    // The camera sits inside SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC, so every body's LABEL is on and
    // pick follows the LABEL, not the glint's brightness: unlit MARS is still picked, as is lit JUPITER.
    // UNKNOWN is not in the seed table (it rides the frame's mesh bodies) → dropped regardless.
    const pickRenderer = makePickRenderer();
    const state = makePickState(pickRenderer);
    const view = makeNear0View(CAM_POS);

    GLINTS.drawPick!(PASS_STUB, view, makeCtx(CAM_POS, [JUPITER, MARS], [UNKNOWN]), state);

    expect(pickRenderer.drawPoints).toHaveBeenCalledTimes(1);
    const [passArg, args] = pickRenderer.drawPoints.mock.calls[0]!;
    expect(passArg).toBe(PASS_STUB);

    expect(args.points).toHaveLength(3);

    // Jupiter's packed id, hand-computed: (Source.Planet=22 << 26) | (seedIndex 3 +
    // PICK_SENTINEL_OFFSET 1) = 1476395008 | 4 = 1476395012.
    const jupiter = args.points.find(
      (p) => p.packedId === packSelection(Source.Planet, 3 + PICK_SENTINEL_OFFSET),
    )!;
    expect(jupiter).toBeDefined();
    expect(jupiter.packedId).toBe(1_476_395_012);
    // A heliocentric planet carries the PLANET priority class (1) — the datum the
    // glint variant maps to its own depth band so Jupiter out-picks its moons.
    expect(jupiter.bandClass).toBe(1);
    expect(jupiter.posRelCamMpc[0]).toBeCloseTo(JUPITER.positionMpc[0] - CAM_POS[0], 20);

    // The invisible (unlit) MARS IS clickable inside the caption gate — pick follows
    // the label. Mars is a heliocentric planet, so it carries class 1 too.
    const mars = args.points.find(
      (p) => p.packedId === packSelection(Source.Planet, 2 + PICK_SENTINEL_OFFSET),
    )!;
    expect(mars).toBeDefined();
    expect(mars.bandClass).toBe(1);

    // The vp is the f32 narrow of the f64 rebase — NOT the raw f32 view.vp.
    expect(args.vp).not.toBe(view.vp);
    expect(args.vp).toEqual(narrowMat4(rebaseViewProj(view.slab.vp, CAM_POS)));
    expect(args.viewportPx).toBe(view.viewportPx);
  });

  it('BEYOND the caption gate skips the invisible (unlit) glint — pick reverts to glint visibility', () => {
    // Past SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC no label invites the click, so pick follows glint
    // visibility. Camera parked 2× the caption gate down +x; a 160 km MARS between the Sun and the
    // camera is sub-pixel (→ glints branch) AND unlit, so it is skipped.
    const marsFar: SeededPlanet = {
      id: asSceneBodyId('mars'),
      label: 'mars',
      positionMpc: [SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC, 0, 0],
      resolvePx: 3,
      surface: { datumRadiusM: 160000, reliefM: [0, 0] },
      albedo: [0.6, 0.32, 0.23],
      orientation: IDENTITY,
    };
    const camFar: Vec3 = [SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC * 2, 0, 0];
    const pickRenderer = makePickRenderer();
    const state = makePickState(pickRenderer);

    GLINTS.drawPick!(PASS_STUB, makeNear0View(camFar), makeCtx(camFar, [marsFar]), state);

    const [, args] = pickRenderer.drawPoints.mock.calls[0]!;
    expect(args.points).toHaveLength(0);
  });

  it('BEYOND the caption gate drops even a LIT glint once the backdrop has dissolved (far dissolve narrows pick past the label range)', () => {
    // Past the label range pick follows the glint's DRAWN brightness, which folds the far-dissolve
    // backdrop: a LIT ~2 px planet past the caption gate has fully dissolved (backdrop 0), so `draw`
    // packs nothing and its pick footprint must go too. A pick brightness omitting the backdrop would
    // keep it clickable.
    const camFar: Vec3 = [SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC * 2, 0, 0];
    expect(camFar[0]).toBeLessThan(FOREGROUND_MAX_DISTANCE_MPC);
    expect(fadeBand(SCALE_FADE_BANDS.bodyGlintBackdrop, camFar[0])).toBe(0);
    const litFar: SeededPlanet = {
      id: asSceneBodyId('jupiter'),
      label: 'jupiter',
      positionMpc: [camFar[0] + 1e5 * KM, 0, 0], // just beyond the camera → lit, ~2 px glint
      resolvePx: 3,
      surface: { datumRadiusM: 160000, reliefM: [0, 0] },
      albedo: [0.8, 0.8, 0.8],
      orientation: IDENTITY,
    };
    const pickRenderer = makePickRenderer();
    const state = makePickState(pickRenderer);

    GLINTS.drawPick!(PASS_STUB, makeNear0View(camFar), makeCtx(camFar, [litFar]), state);

    const [, args] = pickRenderer.drawPoints.mock.calls[0]!;
    expect(args.points).toHaveLength(0);
  });

  it('requests the glint pick variant (so glints collapse onto the shallow priority band)', () => {
    const pickRenderer = makePickRenderer();
    const state = makePickState(pickRenderer);
    GLINTS.drawPick!(PASS_STUB, makeNear0View(CAM_POS), makeCtx(CAM_POS, [JUPITER]), state);
    const [, args] = pickRenderer.drawPoints.mock.calls[0]!;
    expect(args.variant).toBe('glint');
  });

  it('emits the Earth stamp with the EARTH class (0) inside the caption gate, so Earth out-picks every glint', () => {
    // Two lit io/jupiter glints plus a resolved Earth inside the caption gate. Earth rides
    // earthPass, so the layer emits its stamp gated on the caption range. Priority is the per-instance
    // bandClass (0 earth beats 1 planet beats 2 moon, an unconditional depth win), not list order.
    const IO_LIT = bodyAt('io', 1_120_000, [0.8, 0.8, 0.8]); // seed index 10, lit — a MOON
    const pickRenderer = makePickRenderer();
    const state = makePickState(pickRenderer);
    GLINTS.drawPick!(
      PASS_STUB,
      makeNear0View(CAM_POS),
      makeCtx(CAM_POS, [JUPITER, IO_LIT], [], EARTH_RESOLVED),
      state,
    );

    const [, args] = pickRenderer.drawPoints.mock.calls[0]!;
    expect(args.points).toHaveLength(3);

    const byId = (code: number, idx: number) =>
      args.points.find((p) => p.packedId === packSelection(code, idx + PICK_SENTINEL_OFFSET))!;
    const earthPt = byId(Source.Earth, 0);
    expect(earthPt.bandClass).toBe(0);
    expect(byId(Source.Planet, 3).bandClass).toBe(1); // Jupiter — planet
    expect(byId(Source.Planet, 10).bandClass).toBe(2); // Io — moon
    expect(earthPt.posRelCamMpc[0]).toBeCloseTo(EARTH_RESOLVED.positionMpc[0] - CAM_POS[0], 20);
  });

  it('omits the Earth stamp when the camera is beyond the caption gate', () => {
    const pickRenderer2 = makePickRenderer();
    const camFar: Vec3 = [SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC * 2, 0, 0];
    const farEarth = makePickState(pickRenderer2);
    GLINTS.drawPick!(
      PASS_STUB,
      makeNear0View(camFar),
      makeCtx(camFar, [], [], EARTH_RESOLVED),
      farEarth,
    );
    const [, argsB] = pickRenderer2.drawPoints.mock.calls[0]!;
    expect(
      argsB.points.some(
        (p) => p.packedId === packSelection(Source.Earth, 0 + PICK_SENTINEL_OFFSET),
      ),
    ).toBe(false);
  });

  it('emits the Earth stamp beyond the 1 px sphere cull while inside the caption gate (Bug B)', () => {
    // Earth's sphere pick dies at the SUB_PIXEL_BODY_CULL_PX 1 px cull but its caption stays on
    // out to SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC. 1e-6 Mpc from a 6371 km Earth is ~1e-7 px
    // (earthPass.enabled is FALSE) yet inside the caption gate; no planets are seeded, so the Earth
    // stamp is the ONLY pick point.
    const earthSubPixel: SeededPlanet = {
      id: asSceneBodyId('earth'),
      label: 'Earth',
      positionMpc: [1_100_000 * KM, 0, 0],
      resolvePx: 3,
      surface: { datumRadiusM: 6371000, reliefM: [0, 0] },
      albedo: [0.2, 0.4, 0.8],
      orientation: IDENTITY,
    };
    const camMid: Vec3 = [1e-6, 0, 0]; // deep past the 1 px cull, deep inside the caption gate
    const pickRenderer = makePickRenderer();
    const state = makePickState(pickRenderer);

    GLINTS.drawPick!(
      PASS_STUB,
      makeNear0View(camMid),
      makeCtx(camMid, [], [], earthSubPixel),
      state,
    );

    const [, args] = pickRenderer.drawPoints.mock.calls[0]!;
    const earthPt = args.points.find(
      (p) => p.packedId === packSelection(Source.Earth, 0 + PICK_SENTINEL_OFFSET),
    );
    expect(earthPt).toBeDefined();
    expect(earthPt!.bandClass).toBe(0);
    expect(args.points).toHaveLength(1);
  });

  it('tags a planet with class 1 and its moons with class 2 (priority is the class, not order)', () => {
    // A planet plus two lit moons. Priority is the per-instance bandClass (planet 1 out-picks
    // moons 2), not list order; classified through the element table (focusId).
    const IO_LIT = bodyAt('io', 1_120_000, [0.8, 0.8, 0.8]); // index 10, moon of Jupiter
    const EUROPA_LIT = bodyAt('europa', 1_140_000, [0.8, 0.8, 0.8]); // index 11, moon of Jupiter
    const pickRenderer = makePickRenderer();
    const state = makePickState(pickRenderer);
    GLINTS.drawPick!(
      PASS_STUB,
      makeNear0View(CAM_POS),
      makeCtx(CAM_POS, [JUPITER, IO_LIT, EUROPA_LIT]),
      state,
    );

    const [, args] = pickRenderer.drawPoints.mock.calls[0]!;
    const classOf = (idx: number) =>
      args.points.find(
        (p) => p.packedId === packSelection(Source.Planet, idx + PICK_SENTINEL_OFFSET),
      )!.bandClass;
    expect(classOf(3)).toBe(1); // Jupiter — heliocentric planet
    expect(classOf(10)).toBe(2); // Io — satellite moon
    expect(classOf(11)).toBe(2); // Europa — satellite moon
  });
});
