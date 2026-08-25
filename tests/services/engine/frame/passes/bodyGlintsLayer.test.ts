/**
 * bodyGlintsLayer — unit tests for the sub-pixel body glint content row.
 *
 * The load-bearing behaviours:
 *
 *   - The zero-brightness skip (`feedback_opacity_zero_no_render`): a body whose
 *     `brightness · fadeBand(apparentPx)` rounds to 0 — here a body turned to its
 *     unlit far side — is NOT packed into the instance batch; a mid-fade LIT body
 *     IS, with a brightness strictly in (0, 1) (the phase term + the cross-fade).
 *   - The f64 rebase seam (like `starPointsLayer`): the layer hands the renderer
 *     CAMERA-RELATIVE anchors (`pos − camPos`, f64) paired with the REBASED
 *     view-projection, not the raw anchors through the f32-narrowed `view.vp`.
 *   - The migration-table row + registry membership are pinned in
 *     `passes.test.ts` (the `(hdr, NEAR0)` group).
 *
 * Fixtures are hand-placed on the +x axis so each body's apparent-size regime
 * (both sub-3 px glints) AND its phase (one lit, one on the unlit far side) are
 * unambiguous rather than round numbers a unit bug could accidentally satisfy.
 */

import { describe, it, expect, vi } from 'vitest';

import { bodyGlintsLayer } from '../../../../../src/services/engine/frame/passes/bodyGlintsLayer';
import { INSTANCE_FLOATS } from '../../../../../src/services/gpu/renderers/bodies/bodyGlintRenderer';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/solarSystemLabelMaxDistance';
import { SCALE_FADE_BANDS } from '../../../../../src/services/engine/presentation/scaleFadeBands';
import { fadeBand } from '../../../../../src/utils/math/fadeBand';
import { rebaseViewProj } from '../../../../../src/utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../../src/utils/math/narrowMat4';
import { Source } from '../../../../../src/data/sources';
import { SCENE_PLANETS } from '../../../../../src/data/bodies/scenePlanets';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../../src/data/selectionEncoding';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { PlanetBody } from '../../../../../src/@types/scene/PlanetBody';
import type { BodyState } from '../../../../../src/@types/scene/BodyState';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

// The layer reads each body's live position/orientation from the per-frame
// body-state snapshot (keyed by id). Stub it to a map built from the fixture
// bodies, REUSING each record's own positionMpc/orientation refs — so the layer
// sees the exact fixture values (identity-equal), keeping the `toBe(...)`
// assertions below intact while the reads move off the baked record fields.
vi.mock('../../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn((state: EngineState): ReadonlyMap<string, BodyState> => {
    const m = new Map<string, BodyState>();
    // The 'solar-system' region's anchor (sceneAnchors.ts authors the Sun at
    // [0, 0, 0]) — an absent entry reads as Infinity, not 0 (see
    // regionRelativeDistanceMpc's header), so every case needs it regardless of
    // which planets it seeds. Orientation is inlined rather than reusing the
    // module's IDENTITY const: this factory is hoisted above IDENTITY's
    // declaration and runs at first import, a TDZ hazard.
    m.set('sun', {
      positionMpc: [0, 0, 0],
      orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1] as BodyState['orientation'],
      meanAnomalyRad: 0,
    });
    for (const b of (state.data.bodies.planets ?? []) as readonly SeededPlanet[]) {
      m.set(b.id, { positionMpc: b.positionMpc, orientation: b.orientation, meanAnomalyRad: 0 });
    }
    const earth = state.data.bodies.earth as SeededPlanet | null;
    if (earth)
      m.set(earth.id, {
        positionMpc: earth.positionMpc,
        orientation: earth.orientation,
        meanAnomalyRad: 0,
      });
    return m;
  }),
}));

// A test fixture pairing the identity record with the J2000 state the snapshot
// carries — position + orientation were lifted off the record onto the derive, so
// the fixture supplies them here (keyed by id, refs reused by the mock above).
type SeededPlanet = PlanetBody & Pick<BodyState, 'positionMpc' | 'orientation'>;

const KM = SCALE_UNITS.KM_TO_MPC;
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1] as SeededPlanet['orientation'];

// Camera 1e6 km down +x from the Sun (at the origin) — deep inside the
// foreground gate, so `enabled`'s distance check passes.
const CAM_KM = 1_000_000;
const CAM_POS: Vec3 = [CAM_KM * KM, 0, 0];

/**
 * A body on the +x axis at `posKm` km from the Sun, radius `radiusM`. With the
 * camera 1e6 km out and both bodies 1e5 km from it, `radiusM = 160` subtends
 * ~2 px — a mid-fade glint (sub-3 px, so in the glints branch; above 1 px, so
 * the cross-fade is partial). A body FARTHER from the Sun than the camera is lit
 * (camera on the sunlit side); one CLOSER than the camera shows its unlit far
 * side (camera beyond it along the sun ray).
 */
function bodyAt(id: string, posKm: number, albedo: Vec3): SeededPlanet {
  return {
    id,
    label: id,
    positionMpc: [posKm * KM, 0, 0],
    radiusM: 160000,
    albedo,
    orientation: IDENTITY,
  };
}

// LIT: 1.1e6 km out (farther than the camera) → camera between Sun and body →
// full phase. Mid-fade size, bright albedo.
const LIT = bodyAt('lit-body', 1_100_000, [0.8, 0.8, 0.8]);
// UNLIT: 0.9e6 km out (closer than the camera) → camera beyond it along the sun
// ray → new phase, illuminated fraction 0 → zero brightness → skipped.
const UNLIT = bodyAt('unlit-body', 900_000, [0.8, 0.8, 0.8]);

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

const CTX_STUB = {} as ReadyFrameContext;

function makeCtx(camPos: Readonly<Vec3>): ReadyFrameContext {
  return {
    cam: { distance: Math.hypot(camPos[0], camPos[1], camPos[2]) },
    drawCamPos: camPos,
    fovYRad: Math.PI / 3,
    canvasSize: { width: 1280, height: 720 },
  } as unknown as ReadyFrameContext;
}

/** A SlabView whose f64 `slab.vp` and f32 `vp` are deliberately DIFFERENT
 *  arrays, so identity checks reveal which one the layer threads. */
function makeNear0View(camPos: Vec3): SlabView {
  const f64Vp = Float64Array.from({ length: 16 }, (_, i) => i + 0.5);
  const f32Vp = new Float32Array(16);
  const slab: Slab = {
    index: NEAR0,
    nearMpc: 0.0005,
    farMpc: 500,
    vp: f64Vp,
    frame: { kind: 'world-mpc', originRelative: true },
    precision: 'f64',
    reversedZ: false,
  };
  return { slab, vp: f32Vp, camPos, viewportPx: [1280, 720] };
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

function makeState(bodyGlintRenderer: unknown, planets: readonly PlanetBody[]): EngineState {
  return {
    gpu: { bodyGlintRenderer },
    data: { bodies: { planets } },
    // Empty texture family → nothing resident; the glints branch is decided by
    // apparent size before residency anyway.
    assetSlots: { bodyTextures: new Map() },
  } as unknown as EngineState;
}

describe('bodyGlintsLayer.enabled', () => {
  it('is false while the renderer handle is null (short-circuits before ctx / state.data)', () => {
    expect(
      bodyGlintsLayer.enabled(
        { gpu: { bodyGlintRenderer: null } } as unknown as EngineState,
        CTX_STUB,
      ),
    ).toBe(false);
  });

  it('is true below the gate with a sub-pixel body, false beyond the foreground gate', () => {
    const state = makeState(makeRenderer(), [LIT, UNLIT]);
    expect(bodyGlintsLayer.enabled(state, makeCtx(CAM_POS))).toBe(true);
    // At galaxy scale the whole neighbourhood is far below a pixel: the shared
    // gate turns the glints off before the partition even matters.
    expect(bodyGlintsLayer.enabled(state, makeCtx([0, 0, FOREGROUND_MAX_DISTANCE_MPC]))).toBe(
      false,
    );
  });
});

describe('bodyGlintsLayer.enabled — far dissolve (the bite)', () => {
  it('stays on mid-dissolve but LEAVES the pass plan past the backdrop goneAt while still inside the foreground gate', () => {
    // The user-reported bug: the glints have only a NEAR handoff (`bodyGlint`, the
    // 3→1 px fade-in), so as their apparent size drops toward zero they read FULL
    // forever and draw at full additive brightness all the way to the coarse
    // `FOREGROUND_MAX_DISTANCE_MPC` gate — deep in Milky-Way framing, where all ~22
    // collapse onto one bright dot. The `bodyGlintBackdrop` far-dissolve fixes it:
    // once the band zeroes, the layer must LEAVE the pass plan (opacity 0 ⇒ no
    // render), exactly as `starPointsLayer` does with `starBackdrop`.
    const backdrop = SCALE_FADE_BANDS.bodyGlintBackdrop;
    const dMid = (backdrop.fullAt + backdrop.goneAt) / 2; // mid fade → band in (0,1)
    const dGone = backdrop.goneAt * 2; // past goneAt → band 0
    // The far test point is still well inside the shared foreground gate, so ONLY
    // the new far-dissolve gate can flip `enabled` off there.
    expect(dGone).toBeLessThan(FOREGROUND_MAX_DISTANCE_MPC);
    expect(fadeBand(backdrop, dMid)).toBeGreaterThan(0);
    expect(fadeBand(backdrop, dGone)).toBe(0);

    // One body a hair off the Sun: deeply sub-pixel from BOTH cameras (each is
    // astronomically farther out), so it sits in the glints branch either way and
    // the far-dissolve band is the sole thing that flips `enabled`.
    const glint = bodyAt('mars', 1, [0.6, 0.32, 0.23]);
    const state = makeState(makeRenderer(), [glint]);

    expect(bodyGlintsLayer.enabled(state, makeCtx([dMid, 0, 0]))).toBe(true);
    // The bite: unfixed `enabled` has no far-dissolve check, so this reads true.
    expect(bodyGlintsLayer.enabled(state, makeCtx([dGone, 0, 0]))).toBe(false);
  });
});

describe('bodyGlintsLayer.draw — far-dissolve brightness scaling', () => {
  it('scales the packed glint brightness by the backdrop band (identical geometry, only camera-origin distance differs)', () => {
    // Two cameras at DIFFERENT origin distances, but the body pinned the SAME small
    // offset just beyond each (farther from the Sun → full phase at both). So the
    // camera→body geometry — apparent size AND illuminated fraction — is identical
    // at the two cameras and the ONLY thing that can change the packed brightness
    // is the far-dissolve band, which keys on the camera-origin distance. The raw
    // brightness therefore cancels in the ratio and a missing backdrop multiply
    // would leave the two brightnesses equal.
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
        id: 'jupiter',
        label: 'jupiter',
        positionMpc: [camX + OFF, 0, 0], // just beyond the camera → lit, ~2 px glint
        radiusM: 160000,
        albedo: [0.8, 0.8, 0.8],
        orientation: IDENTITY,
      };
      const renderer = makeRenderer();
      bodyGlintsLayer.draw(
        PASS_STUB,
        makeNear0View(camPos),
        makeCtx(camPos),
        makeState(renderer, [body]),
      );
      const [, instances, count] = renderer.draw.mock.calls[0]!;
      expect(count).toBe(1);
      return instances[6]!;
    };

    const full = brightnessAt(dFull);
    const mid = brightnessAt(dMid);
    // The far dissolve dims the mid-band glint; the ratio is exactly the band value.
    expect(mid).toBeLessThan(full);
    expect(mid).toBeCloseTo(full * midFade, 12);
  });
});

describe('bodyGlintsLayer.pickEnabled (Bug B — Earth-stamp-only frame stays in the pick pass)', () => {
  // With NO glints (empty partition) `enabled` is false, but the Earth caption
  // stamp still needs to ride this layer's pick pass while the caption is on. The
  // pick gate is therefore WIDER than the draw gate: admit when glints are present
  // OR when Earth is seeded within the caption range.
  const earthWithinGate: SeededPlanet = {
    id: 'earth',
    label: 'Earth',
    positionMpc: [1_100_000 * KM, 0, 0],
    radiusM: 6371000,
    albedo: [0.2, 0.4, 0.8],
    orientation: IDENTITY,
  };
  function stampState(earth: PlanetBody | null): EngineState {
    return {
      gpu: { bodyGlintRenderer: {} },
      data: { bodies: { planets: [], earth } },
      assetSlots: { bodyTextures: new Map() },
    } as unknown as EngineState;
  }
  const camWithin: Vec3 = [1e-6, 0, 0]; // inside the caption gate
  const camBeyond: Vec3 = [SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC * 2, 0, 0];

  it('is true when Earth is seeded within the caption gate even with an empty glints branch — while enabled is false', () => {
    const state = stampState(earthWithinGate);
    // No glints → the VISUAL draw gate is off.
    expect(bodyGlintsLayer.enabled(state, makeCtx(camWithin))).toBe(false);
    // But the Earth caption stamp must still be recorded → pick gate admits the row.
    expect(bodyGlintsLayer.pickEnabled!(state, makeCtx(camWithin))).toBe(true);
  });

  it('is false with no Earth and no glints, and false beyond the caption gate', () => {
    expect(bodyGlintsLayer.pickEnabled!(stampState(null), makeCtx(camWithin))).toBe(false);
    // Earth seeded but the camera is past the caption gate → no stamp to admit for.
    expect(bodyGlintsLayer.pickEnabled!(stampState(earthWithinGate), makeCtx(camBeyond))).toBe(
      false,
    );
  });
});

describe('bodyGlintsLayer.draw', () => {
  it('skips the zero-brightness (unlit far side) body and packs only the lit mid-fade one', () => {
    const renderer = makeRenderer();
    const state = makeState(renderer, [LIT, UNLIT]);
    const view = makeNear0View(CAM_POS);

    bodyGlintsLayer.draw(PASS_STUB, view, makeCtx(CAM_POS), state);

    expect(renderer.draw).toHaveBeenCalledTimes(1);
    const [passArg, instances, count, vpArg, viewportArg] = renderer.draw.mock.calls[0]!;
    expect(passArg).toBe(PASS_STUB);
    // The unlit body added nothing → exactly one record packed.
    expect(count).toBe(1);
    // The single packed record's brightness is a strict fraction in (0, 1): the
    // phase term (full phase = 1) × size × albedo × the partial cross-fade.
    const brightness = instances[6]!;
    expect(brightness).toBeGreaterThan(0);
    expect(brightness).toBeLessThan(1);
    // It is the LIT body, not the unlit one: its rebased +x anchor is positive
    // (LIT sits farther from the Sun than the camera); the unlit body's would be
    // negative. Confirms which body survived the skip.
    expect(instances[0]!).toBeGreaterThan(0);
    expect(instances[0]!).toBeCloseTo(LIT.positionMpc[0] - CAM_POS[0], 20);
    // Anchors span exactly one INSTANCE_FLOATS-strided record.
    expect(instances.length).toBeGreaterThanOrEqual(INSTANCE_FLOATS);

    // The vp is the f32 narrow of the f64 rebase — NOT the raw f32 view.vp.
    expect(vpArg).not.toBe(view.vp);
    expect(vpArg).toEqual(narrowMat4(rebaseViewProj(view.slab.vp, CAM_POS)));
    expect(viewportArg).toBe(view.viewportPx);
  });

  it('is a no-op when every glint is unlit (nothing packed → no draw)', () => {
    const renderer = makeRenderer();
    // Only the unlit body present: its brightness rounds to 0, so the batch is
    // empty and the additive pass submits nothing.
    const state = makeState(renderer, [UNLIT]);
    bodyGlintsLayer.draw(PASS_STUB, makeNear0View(CAM_POS), makeCtx(CAM_POS), state);
    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('is a no-op when the bodyGlintRenderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View(CAM_POS);
    const state = { gpu: { bodyGlintRenderer: null } } as unknown as EngineState;
    expect(() => bodyGlintsLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });
});

// Glint bodies with REAL seed ids so `seedIndexOfBody(id, SCENE_PLANETS)` resolves
// to a stable index (radius 160 km at ~1e5 km keeps both sub-3 px, so both land in
// the glints branch). JUPITER sits farther from the Sun than the camera (lit);
// MARS sits closer (unlit far side, brightness → 0). The pick mirrors `draw`'s
// per-body visibility skip, so JUPITER IS picked and the invisible MARS is NOT —
// an unlit glint renders nothing and must not stay clickable (pick follows
// visibility). The lit sibling stays in so the skip can't over-drop.
const JUPITER = bodyAt('jupiter', 1_100_000, [0.8, 0.8, 0.8]); // SCENE_PLANETS index 3
const MARS = bodyAt('mars', 900_000, [0.6, 0.32, 0.23]); // SCENE_PLANETS index 2, unlit phase
// An id absent from SCENE_PLANETS: seedIndexOfBody returns −1, so it is DROPPED
// (a packed id from −1 would alias body 0).
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
// diameter is many px, so `earthLayer.enabled` (the SAME predicate the Earth
// stamp is gated on) holds and the stamp is emitted.
const EARTH_RESOLVED: SeededPlanet = {
  id: 'earth',
  label: 'Earth',
  positionMpc: [1_100_000 * KM, 0, 0],
  radiusM: 6371000,
  albedo: [0.2, 0.4, 0.8],
  orientation: IDENTITY,
};

function makePickState(
  bodyPickRenderer: unknown,
  planets: readonly PlanetBody[],
  opts?: { earth?: PlanetBody | null; earthRenderer?: unknown },
): EngineState {
  return {
    // earthRenderer defaults to a truthy stand-in so `earthLayer.enabled` (which
    // short-circuits on a null handle) is exercised by the earth+distance test,
    // not skipped. Distinguish "not provided" (→ {}) from an explicit `null` — a
    // `?? {}` fallback would collapse the pre-bootstrap null-handle case. earth
    // defaults to null → no Earth stamp (the pre-Earth-stamp tests keep theirs).
    gpu: {
      bodyPickRenderer,
      earthRenderer: opts && 'earthRenderer' in opts ? opts.earthRenderer : {},
    },
    data: { bodies: { planets, earth: opts?.earth ?? null } },
    assetSlots: { bodyTextures: new Map() },
  } as unknown as EngineState;
}

describe('bodyGlintsLayer.drawPick', () => {
  it('WITHIN the caption gate picks BOTH the lit and the invisible (unlit) glint, dropping unknowns', () => {
    // Bug B: the camera (CAM_POS, ~3e-14 Mpc) sits deep inside
    // SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC, so every body's foreground LABEL is on
    // and pick follows the LABEL, not the glint's own brightness. MARS is unlit
    // here (brightness → 0) — `draw` still skips it, but its label invites the
    // click, so the pick keeps it. JUPITER is lit and picked. UNKNOWN is not in the
    // seed table → dropped regardless.
    const pickRenderer = makePickRenderer();
    const state = makePickState(pickRenderer, [JUPITER, MARS, UNKNOWN]);
    const view = makeNear0View(CAM_POS);

    bodyGlintsLayer.drawPick!(PASS_STUB, view, makeCtx(CAM_POS), state);

    expect(pickRenderer.drawPoints).toHaveBeenCalledTimes(1);
    const [passArg, args] = pickRenderer.drawPoints.mock.calls[0]!;
    expect(passArg).toBe(PASS_STUB);

    // Both seeded bodies survive within the caption gate; only UNKNOWN is dropped.
    expect(args.points).toHaveLength(2);

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
    // Its anchor is rebased into the camera-relative frame (pos − camPos), f64.
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
    // Past SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC no label invites the click, so the
    // old pick-follows-glint-visibility rule holds: an unlit glint (brightness → 0)
    // renders no pixels and must not stay clickable. Camera parked 2× the caption
    // gate down +x; a 160 km MARS between the Sun and the camera is deeply
    // sub-pixel (→ glints branch) AND unlit (camera beyond it along the sun ray →
    // illuminated fraction 0), so it is skipped.
    const marsFar: SeededPlanet = {
      id: 'mars',
      label: 'mars',
      positionMpc: [SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC, 0, 0],
      radiusM: 160000,
      albedo: [0.6, 0.32, 0.23],
      orientation: IDENTITY,
    };
    const camFar: Vec3 = [SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC * 2, 0, 0];
    const pickRenderer = makePickRenderer();
    const state = makePickState(pickRenderer, [marsFar]);

    bodyGlintsLayer.drawPick!(PASS_STUB, makeNear0View(camFar), makeCtx(camFar), state);

    const [, args] = pickRenderer.drawPoints.mock.calls[0]!;
    // No label, unlit → skipped. No Earth seeded → the batch is empty.
    expect(args.points).toHaveLength(0);
  });

  it('BEYOND the caption gate drops even a LIT glint once the backdrop has dissolved (far dissolve narrows pick past the label range)', () => {
    // Past SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC no label invites the click, so pick
    // follows the glint's DRAWN brightness — which now folds the far-dissolve
    // backdrop. A LIT, ~2 px planet parked past the caption gate has fully
    // dissolved (backdrop 0), so `draw` packs nothing and its pick footprint must
    // go too — otherwise a glint that renders no pixels stays clickable. Pre-fix
    // (the pick brightness omitted the backdrop band) the lit body's raw brightness
    // clears GLINT_MIN and it stays pickable → the bite.
    const camFar: Vec3 = [SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC * 2, 0, 0];
    // Still inside the shared foreground gate, so the pick pass admits the row and
    // only the far dissolve can drop the point.
    expect(camFar[0]).toBeLessThan(FOREGROUND_MAX_DISTANCE_MPC);
    expect(fadeBand(SCALE_FADE_BANDS.bodyGlintBackdrop, camFar[0])).toBe(0);
    const litFar: SeededPlanet = {
      id: 'jupiter',
      label: 'jupiter',
      positionMpc: [camFar[0] + 1e5 * KM, 0, 0], // just beyond the camera → lit, ~2 px glint
      radiusM: 160000,
      albedo: [0.8, 0.8, 0.8],
      orientation: IDENTITY,
    };
    const pickRenderer = makePickRenderer();
    const state = makePickState(pickRenderer, [litFar]);

    bodyGlintsLayer.drawPick!(PASS_STUB, makeNear0View(camFar), makeCtx(camFar), state);

    const [, args] = pickRenderer.drawPoints.mock.calls[0]!;
    expect(args.points).toHaveLength(0);
  });

  it('requests the glint pick variant (so glints collapse onto the shallow priority band)', () => {
    const pickRenderer = makePickRenderer();
    const state = makePickState(pickRenderer, [JUPITER]);
    bodyGlintsLayer.drawPick!(PASS_STUB, makeNear0View(CAM_POS), makeCtx(CAM_POS), state);
    const [, args] = pickRenderer.drawPoints.mock.calls[0]!;
    expect(args.variant).toBe('glint');
  });

  it('emits the Earth stamp with the EARTH class (0) inside the caption gate, so Earth out-picks every glint', () => {
    // Two lit io/jupiter glints plus a resolved Earth, camera inside the caption
    // gate. Earth is not in the partition (it rides earthLayer), so the layer emits
    // its stamp gated on the caption range (earth !== null && distance < gate).
    // Priority is
    // now the per-instance bandClass — 0 (earth) beats 1 (planet) beats 2 (moon) as
    // an unconditional depth win — NOT the list order, so the load-bearing check is
    // the CLASS each point carries, not its index.
    const IO_LIT = bodyAt('io', 1_120_000, [0.8, 0.8, 0.8]); // seed index 10, lit — a MOON
    const pickRenderer = makePickRenderer();
    const state = makePickState(pickRenderer, [JUPITER, IO_LIT], { earth: EARTH_RESOLVED });
    bodyGlintsLayer.drawPick!(PASS_STUB, makeNear0View(CAM_POS), makeCtx(CAM_POS), state);

    const [, args] = pickRenderer.drawPoints.mock.calls[0]!;
    expect(args.points).toHaveLength(3);

    // Look each body up by its packed id (order carries no priority now) and assert
    // its class: Earth 0, the heliocentric Jupiter 1, the Jovian moon Io 2.
    const byId = (code: number, idx: number) =>
      args.points.find((p) => p.packedId === packSelection(code, idx + PICK_SENTINEL_OFFSET))!;
    const earthPt = byId(Source.Earth, 0);
    expect(earthPt.bandClass).toBe(0);
    expect(byId(Source.Planet, 3).bandClass).toBe(1); // Jupiter — planet
    expect(byId(Source.Planet, 10).bandClass).toBe(2); // Io — moon
    // The Earth stamp's anchor is Earth's position rebased into the camera frame.
    expect(earthPt.posRelCamMpc[0]).toBeCloseTo(EARTH_RESOLVED.positionMpc[0] - CAM_POS[0], 20);
  });

  it('omits the Earth stamp when earth is null OR the camera is beyond the caption gate', () => {
    const pickRenderer = makePickRenderer();
    // earth null → no stamp (only the lit Jupiter).
    const noEarth = makePickState(pickRenderer, [JUPITER], { earth: null });
    bodyGlintsLayer.drawPick!(PASS_STUB, makeNear0View(CAM_POS), makeCtx(CAM_POS), noEarth);
    const [, argsA] = pickRenderer.drawPoints.mock.calls[0]!;
    expect(
      argsA.points.some(
        (p) => p.packedId === packSelection(Source.Earth, 0 + PICK_SENTINEL_OFFSET),
      ),
    ).toBe(false);
    expect(argsA.points).toHaveLength(1);

    // Camera beyond the caption gate (2× the gate distance) even with a seeded
    // Earth → no label invites the click → no stamp. The stamp is no longer coupled
    // to earthRenderer's handle (pick draws via bodyPickRenderer, not earthRenderer).
    const pickRenderer2 = makePickRenderer();
    const camFar: Vec3 = [SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC * 2, 0, 0];
    const farEarth = makePickState(pickRenderer2, [], { earth: EARTH_RESOLVED });
    bodyGlintsLayer.drawPick!(PASS_STUB, makeNear0View(camFar), makeCtx(camFar), farEarth);
    const [, argsB] = pickRenderer2.drawPoints.mock.calls[0]!;
    expect(
      argsB.points.some(
        (p) => p.packedId === packSelection(Source.Earth, 0 + PICK_SENTINEL_OFFSET),
      ),
    ).toBe(false);
  });

  it('emits the Earth stamp beyond the 1 px sphere cull while inside the caption gate (Bug B)', () => {
    // The core Bug B regression: Earth's sphere pick dies at the
    // SUB_PIXEL_BODY_CULL_PX 1 px cull, but its caption stays on out to
    // SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC — ten orders of magnitude of zoom where
    // the label invites a click. A camera 1e-6 Mpc from a 6371 km Earth makes it
    // ~1e-7 px across (deep sub-pixel — earthLayer.enabled is FALSE here), yet
    // 1e-6 Mpc ≪ the caption gate. No planets seeded (empty glints branch), so the
    // Earth stamp is the ONLY pick point. On the pre-fix code (gated on
    // earthLayer.enabled) this batch is empty — the bite.
    const earthSubPixel: SeededPlanet = {
      id: 'earth',
      label: 'Earth',
      positionMpc: [1_100_000 * KM, 0, 0],
      radiusM: 6371000,
      albedo: [0.2, 0.4, 0.8],
      orientation: IDENTITY,
    };
    const camMid: Vec3 = [1e-6, 0, 0]; // deep past the 1 px cull, deep inside the caption gate
    const pickRenderer = makePickRenderer();
    const state = makePickState(pickRenderer, [], { earth: earthSubPixel });

    bodyGlintsLayer.drawPick!(PASS_STUB, makeNear0View(camMid), makeCtx(camMid), state);

    const [, args] = pickRenderer.drawPoints.mock.calls[0]!;
    const earthPt = args.points.find(
      (p) => p.packedId === packSelection(Source.Earth, 0 + PICK_SENTINEL_OFFSET),
    );
    expect(earthPt).toBeDefined();
    expect(earthPt!.bandClass).toBe(0);
    expect(args.points).toHaveLength(1);
  });

  it('tags a planet with class 1 and its moons with class 2 (priority is the class, not order)', () => {
    // A planet plus two of its moons, all lit. Priority is the per-instance
    // bandClass — the planet's 1 out-picks the moons' 2 as an unconditional depth
    // win — so the load-bearing datum is the CLASS each carries, whatever order the
    // list happens to be in. Classified through the element table (focusId).
    const IO_LIT = bodyAt('io', 1_120_000, [0.8, 0.8, 0.8]); // index 10, moon of Jupiter
    const EUROPA_LIT = bodyAt('europa', 1_140_000, [0.8, 0.8, 0.8]); // index 11, moon of Jupiter
    const pickRenderer = makePickRenderer();
    const state = makePickState(pickRenderer, [JUPITER, IO_LIT, EUROPA_LIT]);
    bodyGlintsLayer.drawPick!(PASS_STUB, makeNear0View(CAM_POS), makeCtx(CAM_POS), state);

    const [, args] = pickRenderer.drawPoints.mock.calls[0]!;
    const classOf = (idx: number) =>
      args.points.find(
        (p) => p.packedId === packSelection(Source.Planet, idx + PICK_SENTINEL_OFFSET),
      )!.bandClass;
    expect(classOf(3)).toBe(1); // Jupiter — heliocentric planet
    expect(classOf(10)).toBe(2); // Io — satellite moon
    expect(classOf(11)).toBe(2); // Europa — satellite moon
  });

  it('is a no-op when the bodyPickRenderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View(CAM_POS);
    const state = { gpu: { bodyPickRenderer: null } } as unknown as EngineState;
    expect(() => bodyGlintsLayer.drawPick!(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });
});
