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
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const KM = SCALE_UNITS.KM_TO_MPC;
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1] as PlanetBody['orientation'];

// Camera 1e6 km down +x from the Sun (at the origin) — deep inside the
// foreground gate, so `enabled`'s distance check passes.
const CAM_KM = 1_000_000;
const CAM_POS: Vec3 = [CAM_KM * KM, 0, 0];

/**
 * A body on the +x axis at `posKm` km from the Sun, radius `radiusKm`. With the
 * camera 1e6 km out and both bodies 1e5 km from it, `radiusKm = 160` subtends
 * ~2 px — a mid-fade glint (sub-3 px, so in the glints branch; above 1 px, so
 * the cross-fade is partial). A body FARTHER from the Sun than the camera is lit
 * (camera on the sunlit side); one CLOSER than the camera shows its unlit far
 * side (camera beyond it along the sun ray).
 */
function bodyAt(id: string, posKm: number, albedo: Vec3): PlanetBody {
  return {
    id,
    label: id,
    positionMpc: [posKm * KM, 0, 0],
    radiusKm: 160,
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
    originRelative: true,
    precision: 'f64',
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
    expect(bodyGlintsLayer.enabled(state, makeCtx([0, 0, FOREGROUND_MAX_DISTANCE_MPC]))).toBe(false);
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
    drawPoints:
      vi.fn<(pass: GPURenderPassEncoder, args: { vp: Float32Array; viewportPx: readonly [number, number]; points: readonly { posRelCamMpc: Vec3; packedId: number }[]; variant?: 'sceneStar' | 'glint' }) => void>(),
  };
}

// A resolved Earth 1.1e6 km down +x — with the camera at 1e6 km its apparent
// diameter is many px, so `earthLayer.enabled` (the SAME predicate the Earth
// stamp is gated on) holds and the stamp is emitted.
const EARTH_RESOLVED: PlanetBody = {
  id: 'earth',
  label: 'Earth',
  positionMpc: [1_100_000 * KM, 0, 0],
  radiusKm: 6371,
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
  it('picks the lit glint but skips the invisible (unlit) one, dropping unknowns', () => {
    const pickRenderer = makePickRenderer();
    // MARS is unlit here (brightness → 0) — `draw` skips it and so must the pick,
    // since it renders no pixels (pick follows visibility). JUPITER is lit and IS
    // picked. UNKNOWN is not in the seed table → dropped.
    const state = makePickState(pickRenderer, [JUPITER, MARS, UNKNOWN]);
    const view = makeNear0View(CAM_POS);

    bodyGlintsLayer.drawPick!(PASS_STUB, view, makeCtx(CAM_POS), state);

    expect(pickRenderer.drawPoints).toHaveBeenCalledTimes(1);
    const [passArg, args] = pickRenderer.drawPoints.mock.calls[0]!;
    expect(passArg).toBe(PASS_STUB);

    // Only the lit JUPITER survives: the invisible MARS is skipped, UNKNOWN dropped.
    expect(args.points).toHaveLength(1);

    // Jupiter's packed id, hand-computed: (Source.Planet=22 << 27) | (seedIndex 3 +
    // PICK_SENTINEL_OFFSET 1) = 2952790016 | 4 = 2952790020.
    const jupiter = args.points.find(
      (p) => p.packedId === packSelection(Source.Planet, 3 + PICK_SENTINEL_OFFSET),
    )!;
    expect(jupiter).toBeDefined();
    expect(jupiter.packedId).toBe(2_952_790_020);
    // Its anchor is rebased into the camera-relative frame (pos − camPos), f64.
    expect(jupiter.posRelCamMpc[0]).toBeCloseTo(JUPITER.positionMpc[0] - CAM_POS[0], 20);

    // The invisible MARS (unlit far side) is NOT clickable — no pick point carries
    // its stable index (2). This is the inverse of the old behaviour: pick now
    // mirrors `draw`'s per-body visibility skip.
    const mars = args.points.find(
      (p) => p.packedId === packSelection(Source.Planet, 2 + PICK_SENTINEL_OFFSET),
    );
    expect(mars).toBeUndefined();

    // The vp is the f32 narrow of the f64 rebase — NOT the raw f32 view.vp.
    expect(args.vp).not.toBe(view.vp);
    expect(args.vp).toEqual(narrowMat4(rebaseViewProj(view.slab.vp, CAM_POS)));
    expect(args.viewportPx).toBe(view.viewportPx);
  });

  it('requests the glint pick variant (so glints collapse onto the shallow priority band)', () => {
    const pickRenderer = makePickRenderer();
    const state = makePickState(pickRenderer, [JUPITER]);
    bodyGlintsLayer.drawPick!(PASS_STUB, makeNear0View(CAM_POS), makeCtx(CAM_POS), state);
    const [, args] = pickRenderer.drawPoints.mock.calls[0]!;
    expect(args.variant).toBe('glint');
  });

  it('prepends the Earth stamp FIRST when earthLayer.enabled holds, so Earth out-picks every glint', () => {
    // Two lit io/jupiter glints plus a resolved Earth. Earth is not in the
    // partition (it rides earthLayer), so the layer prepends its stamp — and it
    // must be instance 0 so the draw-order tie-break inside the shared glint band
    // makes Earth beat the Moon and every planet.
    const IO_LIT = bodyAt('io', 1_120_000, [0.8, 0.8, 0.8]); // seed index 10, lit
    const pickRenderer = makePickRenderer();
    const state = makePickState(pickRenderer, [JUPITER, IO_LIT], { earth: EARTH_RESOLVED });
    bodyGlintsLayer.drawPick!(PASS_STUB, makeNear0View(CAM_POS), makeCtx(CAM_POS), state);

    const [, args] = pickRenderer.drawPoints.mock.calls[0]!;
    // Earth first, then the seed-order glints (Jupiter before Io).
    expect(args.points).toHaveLength(3);
    expect(args.points[0]!.packedId).toBe(packSelection(Source.Earth, 0 + PICK_SENTINEL_OFFSET));
    expect(args.points[1]!.packedId).toBe(packSelection(Source.Planet, 3 + PICK_SENTINEL_OFFSET));
    expect(args.points[2]!.packedId).toBe(packSelection(Source.Planet, 10 + PICK_SENTINEL_OFFSET));
    // The Earth stamp's anchor is Earth's position rebased into the camera frame.
    expect(args.points[0]!.posRelCamMpc[0]).toBeCloseTo(
      EARTH_RESOLVED.positionMpc[0] - CAM_POS[0],
      20,
    );
  });

  it('omits the Earth stamp when earthLayer.enabled is false (earth null or handle null)', () => {
    const pickRenderer = makePickRenderer();
    // earth null → earthLayer.enabled false → no stamp (only the lit Jupiter).
    const noEarth = makePickState(pickRenderer, [JUPITER], { earth: null });
    bodyGlintsLayer.drawPick!(PASS_STUB, makeNear0View(CAM_POS), makeCtx(CAM_POS), noEarth);
    const [, argsA] = pickRenderer.drawPoints.mock.calls[0]!;
    expect(argsA.points.some((p) => p.packedId === packSelection(Source.Earth, 0 + PICK_SENTINEL_OFFSET))).toBe(false);
    expect(argsA.points).toHaveLength(1);

    // earthRenderer null (pre-bootstrap) even with a seeded earth → still no stamp.
    const pickRenderer2 = makePickRenderer();
    const noHandle = makePickState(pickRenderer2, [JUPITER], {
      earth: EARTH_RESOLVED,
      earthRenderer: null,
    });
    bodyGlintsLayer.drawPick!(PASS_STUB, makeNear0View(CAM_POS), makeCtx(CAM_POS), noHandle);
    const [, argsB] = pickRenderer2.drawPoints.mock.calls[0]!;
    expect(argsB.points.some((p) => p.packedId === packSelection(Source.Earth, 0 + PICK_SENTINEL_OFFSET))).toBe(false);
  });

  it('preserves the partition (seed) order of glints in the instance list', () => {
    // Three lit glints in a known input order — the pick list must keep it so the
    // draw-order tie-break equals the seed priority (planet before its moons).
    const IO_LIT = bodyAt('io', 1_120_000, [0.8, 0.8, 0.8]); // index 10
    const EUROPA_LIT = bodyAt('europa', 1_140_000, [0.8, 0.8, 0.8]); // index 11
    const pickRenderer = makePickRenderer();
    const state = makePickState(pickRenderer, [JUPITER, IO_LIT, EUROPA_LIT]);
    bodyGlintsLayer.drawPick!(PASS_STUB, makeNear0View(CAM_POS), makeCtx(CAM_POS), state);

    const [, args] = pickRenderer.drawPoints.mock.calls[0]!;
    expect(args.points.map((p) => p.packedId)).toEqual([
      packSelection(Source.Planet, 3 + PICK_SENTINEL_OFFSET),
      packSelection(Source.Planet, 10 + PICK_SENTINEL_OFFSET),
      packSelection(Source.Planet, 11 + PICK_SENTINEL_OFFSET),
    ]);
  });

  it('is a no-op when the bodyPickRenderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View(CAM_POS);
    const state = { gpu: { bodyPickRenderer: null } } as unknown as EngineState;
    expect(() => bodyGlintsLayer.drawPick!(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });
});
