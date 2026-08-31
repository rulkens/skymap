/**
 * earthLayer — unit tests for Earth's `'body'`-slab content row.
 *
 * Like the other body-slab layers, the load-bearing assertion is the f64 seam: the
 * layer MUST feed `composeBodySlabMvp` the slab's `Float64Array` view-projection
 * (`view.slab.vp`), NOT the f32-narrowed `view.vp`. `composeBodySlabMvp` and
 * `bodySlabCamLocal` are both mocked to fixed, recognisable return values —
 * the primitives' own math is covered by their own test files; this suite
 * pins that the layer feeds them the right ARGUMENTS and forwards their
 * RETURN values to the right uniform slots / draw-call fields.
 *
 * `bodyRelativePose` is left UNMOCKED (its own test file covers the math):
 * `prepareBodySurfaceFrame` calls it for real, so `ctx.cam` fixtures need
 * non-degenerate `position`/`target` fields, not just the bare `{ distance }`
 * shape the pre-body-slab fixtures got away with.
 *
 * The layer also gates on TWO handles — the `earthRenderer` GPU handle and the
 * seeded `bodies.earth` record — so `enabled` is false until both are present,
 * AND on the shared near-field distance gate (`FOREGROUND_MAX_DISTANCE_MPC`),
 * AND on the view's slab actually being Earth's own `body-m` row. This suite
 * carries the representative executor-group check: above the gate the whole
 * `(foreground:0, 'body')` group must come back empty from the SAME filter
 * `executeFrame` uses, which is what lets the frame skip the foreground
 * render pass + its composite wholesale at galaxy zoom.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  earthLayer,
  prepareBodySurfaceFrame,
} from '../../../../../src/services/engine/frame/passes/earthLayer';
import { CONTENT_LAYERS } from '../../../../../src/services/engine/frame/passes';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCENE_EARTH } from '../../../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../../src/data/bodies/scenePlanets';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { sunDirLocal } from '../../../../../src/utils/camera/sunDirLocal';
import { imagePlaneBasis } from '../../../../../src/utils/camera/imagePlaneBasis';
import { frameUp } from '../../../../../src/utils/camera/frameUp';
import { normalize3 } from '../../../../../src/utils/math/normalize3';
import { mat3FromColumns } from '../../../../../src/utils/math/mat3FromColumns';
import { bodyRelativePose } from '../../../../../src/services/engine/camera/bodyRelativePose';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { EARTH_SURFACE_PARAMS } from '../../../../../src/data/bodies/earthSurfaceParams';
import { CLOUD_SHELL_PARAMS } from '../../../../../src/data/bodies/cloudShellParams';
import {
  EARTH_BASE_GLOBE_FADE_FULL_ALTITUDE_KM,
  EARTH_BASE_GLOBE_FADE_GONE_ALTITUDE_KM,
} from '../../../../../src/data/bodies/earthTileParams';
import { Source } from '../../../../../src/data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../../src/data/selectionEncoding';
import { BODY_PICK_MIN_RADIUS_PX } from '../../../../../src/services/engine/helpers/minPickRadiusMpc';
import { makeSlab } from '../../../../fixtures/makeSlab';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { BodyId } from '../../../../../src/@types/data/body/BodyId';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { EarthBody } from '../../../../../src/@types/scene/EarthBody';
import type { PlanetBody } from '../../../../../src/@types/scene/PlanetBody';
import type { BodyState } from '../../../../../src/@types/scene/BodyState';
import type { BodyPoseProvider } from '../../../../../src/@types/engine/camera/BodyPoseProvider';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { EarthSurfaceTileDrawArgs } from '../../../../../src/@types/rendering/EarthSurfaceTileRenderer';

// Mock the two body-slab compose primitives so the test can (a) assert which
// vp/pose they consumed by argument identity and (b) hand the layer
// recognisable return values — the real primitives' math is covered by
// composeBodySlabMvp.test.ts / bodySlabCamLocal.test.ts.
const MOCK_MVP = new Float64Array(16);
const MOCK_CAM_LOCAL: Vec3 = [0.1, 0.2, 0.3];
vi.mock('../../../../../src/utils/camera/composeBodySlabMvp', () => ({
  composeBodySlabMvp: vi.fn<() => Float64Array>(() => MOCK_MVP),
}));
vi.mock('../../../../../src/utils/camera/bodySlabCamLocal', () => ({
  bodySlabCamLocal: vi.fn<() => Vec3>(() => MOCK_CAM_LOCAL),
}));
import { composeBodySlabMvp } from '../../../../../src/utils/camera/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../../../src/utils/camera/bodySlabCamLocal';

// The layer reads each body's live position/orientation from the per-frame
// body-state snapshot (keyed by id). Stub it to a map built from
// state.data.bodies.earth AND .planets — REUSING each fixture's own
// positionMpc/orientation refs — so the layer sees the exact fixture values
// (identity-equal), keeping toBe(...) assertions intact while the reads move
// off the baked record fields. Generic over id (not earth-only) so the
// second-bodyId memo test below has a real second body to resolve.
vi.mock('../../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn((state: EngineState): ReadonlyMap<string, BodyState> => {
    const m = new Map<string, BodyState>();
    const bodies = state.data.bodies as unknown as {
      earth: SeededBody | null;
      planets: readonly SeededBody[];
    };
    if (bodies.earth) m.set(bodies.earth.id, toBodyState(bodies.earth));
    for (const p of bodies.planets) m.set(p.id, toBodyState(p));
    return m;
  }),
}));

type SeededBody = (EarthBody | PlanetBody) & Pick<BodyState, 'positionMpc' | 'orientation'>;
function toBodyState(b: SeededBody): BodyState {
  return { positionMpc: b.positionMpc, orientation: b.orientation, meanAnomalyRad: 0 };
}

// Fixtures pairing each body's identity record with its real J2000 state —
// position + orientation are sourced from deriveBodyStates so the values are
// the real ones and the refs stay stable across the assertions.
const EARTH_STATE = deriveBodyStates(CONST_J2000).get('earth')!;
const SEEDED_EARTH: SeededBody = {
  ...SCENE_EARTH,
  positionMpc: EARTH_STATE.positionMpc,
  orientation: EARTH_STATE.orientation,
};
const MARS_STATE = deriveBodyStates(CONST_J2000).get('mars')!;
const SEEDED_MARS: SeededBody = {
  ...SCENE_PLANETS.find((p) => p.id === 'mars')!,
  positionMpc: MARS_STATE.positionMpc,
  orientation: MARS_STATE.orientation,
};

const BODY_STATES_BY_ID = new Map<string, BodyState>([
  ['earth', toBodyState(SEEDED_EARTH)],
  ['mars', toBodyState(SEEDED_MARS)],
]);

/**
 * A real `BodyPoseProvider` for a given camera position/target — mirrors
 * `frameContext.ts`'s own construction (camBasisWorld via
 * imagePlaneBasis/frameUp at roll 0, then `bodyRelativePose` per body) so
 * `ctx.bodyPose` here exercises the SAME seam `earthLayer.ts` now reads
 * (Task 9 fix round 1, B2) instead of a bespoke double. Resolves both earth
 * and mars unconditionally — a given test's `state.data.bodies` (via the
 * mocked `sceneBodyStates` above) is the actual per-test gate on which body
 * a call succeeds for.
 */
function makeBodyPose(camPosMpc: Vec3, target: Vec3): BodyPoseProvider {
  const camForward = normalize3([
    target[0] - camPosMpc[0],
    target[1] - camPosMpc[1],
    target[2] - camPosMpc[2],
  ]);
  const { right, up } = imagePlaneBasis(camForward, 0, frameUp(undefined));
  const camBasisWorld = mat3FromColumns(right, up, camForward);
  return (bodyId) => {
    const bodyState = BODY_STATES_BY_ID.get(bodyId);
    if (bodyState === undefined) return null;
    return bodyRelativePose({ bodyId, camPosMpc, camBasisWorld, bodyState });
  };
}

const mvpMock = composeBodySlabMvp as unknown as ReturnType<typeof vi.fn>;
const camLocalMock = bodySlabCamLocal as unknown as ReturnType<typeof vi.fn>;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setIndexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  drawIndexed: vi.fn(),
} as unknown as GPURenderPassEncoder;

// Bare ctx for the null-handle and draw cases: draw never reads ctx, and
// enabled's handle check must short-circuit BEFORE the ctx.cam read
// (renderFrame fixtures carry null handles and a bare ctx).
const CTX_STUB = {} as ReadyFrameContext;

/**
 * A ctx whose camera sits `distance` Mpc from Earth's centre along +x,
 * looking AT Earth — `bodyRelativePose` (unmocked) needs a real
 * position/target pair to derive a non-degenerate basis, unlike the old
 * `{ cam: { distance } }` shape which never fed the pose seam. `cam.distance`
 * (the orbit distance-to-focus) is set independently from the camera's
 * actual position, exactly as before: the two gates it and the sub-pixel
 * cull key off are meant to vary independently across these tests.
 */
function makeCtx(distance: number): ReadyFrameContext {
  const drawCamPos: Vec3 = [
    SEEDED_EARTH.positionMpc[0] + 1e-13,
    SEEDED_EARTH.positionMpc[1],
    SEEDED_EARTH.positionMpc[2],
  ];
  return {
    cam: { distance, position: drawCamPos, target: SEEDED_EARTH.positionMpc },
    drawCamPos,
    bodyPose: makeBodyPose(drawCamPos, SEEDED_EARTH.positionMpc),
    canvasSize: { width: 1280, height: 720 },
    fovYRad: (60 * Math.PI) / 180,
    drawPxPerRad: 720 / (2 * Math.tan((60 * Math.PI) / 180 / 2)),
  } as unknown as ReadyFrameContext;
}

// A camera comfortably inside the shared foreground gate. Reused by reference
// where safe; the first few `earthLayer.draw` tests below call `makeCtx`
// fresh instead — `prepareBodySurfaceFrame`'s ctx-keyed memo would otherwise
// let the second and third hit the cache the first one primed (same
// NEAR_CTX object ⇒ same memo entry ⇒ composeBodySlabMvp not re-invoked, and
// the first test's `toHaveBeenCalledTimes(1)` would misattribute the shared
// call).
const NEAR_CTX = makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2);

/**
 * A body-m SlabView for `bodyId`, whose f64 `slab.vp` and f32 `vp` are
 * deliberately DIFFERENT arrays, so a first-arg identity check unambiguously
 * reveals which one the layer fed to composeBodySlabMvp. The f64 array
 * carries recognisable non-zero values; the f32 array is left as a distinct
 * all-zero Float32Array.
 */
function makeEarthBodyView(bodyId: 'earth' | 'mars' = 'earth'): SlabView {
  const f64Vp = Float64Array.from({ length: 16 }, (_, i) => i + 0.5);
  const f32Vp = new Float32Array(16);
  // `BodyId` is the coarse source-registry category set ('earth' | 'planet' |
  // …), not per-planet ids — `bodySlabRow` (slabs.ts) already force-casts a
  // SceneBody's real string id ('mars', 'venus', …) the same way when it
  // builds a body-m row's frame.
  const slab: Slab = makeSlab({
    vp: f64Vp,
    frame: { kind: 'body-m', bodyId: bodyId as BodyId },
  });
  return {
    slab,
    vp: f32Vp,
    camPos: [0, 0, 5],
    viewportPx: [1280, 720],
  };
}

/** State whose `earthRenderer` handle + `bodies.earth` record are both set. */
function makeState(earthRenderer: unknown, earth: EarthBody | null): EngineState {
  return {
    gpu: { earthRenderer },
    data: { bodies: { earth, planets: [], stars: [] } },
    // The tile subsystem is absent until `wireSlots` builds it, and a session
    // that never approaches Earth never engages it — so `null` here is the
    // shipped identity case, in which the packed page-table window is all-zero
    // and the fragment reads the whole-globe base texture alone.
    subsystems: { earthTiles: null },
    // earthLayer.draw reads the live night-side floor + ocean-glint roughness
    // from settings.earth each frame; seed both from EARTH_SURFACE_PARAMS so the
    // packed tail slots equal the authored defaults (a no-op override, exactly
    // how the settings slice seeds them).
    settings: {
      earth: {
        ambientLight: EARTH_SURFACE_PARAMS.ambientLight,
        oceanRoughness: EARTH_SURFACE_PARAMS.oceanRoughness,
      },
      // The Earth LOD overlay debug toggle earthLayer.draw now reads each
      // frame (forwarded into the tile draw args) — off by default, like the
      // fixture's other DEBUG_OVERLAY_ROWS entries.
      debug: { overlays: { 'earth-lod-overlay': false } },
    },
  } as unknown as EngineState;
}

/**
 * `makeState`'s tile-draw variant: adds the `earthSurfaceTileRenderer` GPU
 * handle and an `earthTiles` subsystem stub whose `getLastCut`/`getAtlasView`
 * are caller-controlled — the instanced-draw gate's three inputs
 * (`state.gpu.earthSurfaceTileRenderer`, `getAtlasView()`, `getLastCut()`).
 */
function makeTileDrawState(input: {
  readonly tileRenderer: unknown;
  readonly cut: readonly unknown[];
  readonly atlasView: GPUTextureView | null;
}): EngineState {
  const base = makeState(
    { draw: vi.fn(), getMapView: vi.fn(() => ({}) as GPUTextureView) },
    SEEDED_EARTH,
  );
  return {
    ...base,
    gpu: {
      ...(base as unknown as { gpu: object }).gpu,
      earthSurfaceTileRenderer: input.tileRenderer,
    },
    subsystems: {
      earthTiles: {
        getLastCut: () => input.cut,
        getAtlasView: () => input.atlasView,
      },
    },
  } as unknown as EngineState;
}

// `enabled` reads `view.slab.frame` now — every gating case below passes a
// real Earth body-m view (VIEW_STUB reused where the rest of the gate is
// what's under test).
const VIEW_STUB = makeEarthBodyView('earth');

describe('earthLayer.enabled', () => {
  it('is false when the view is not Earth’s own body-m row', () => {
    const state = makeState({ draw: vi.fn() }, SEEDED_EARTH);
    const worldMpcView = makeSlab({ frame: { kind: 'world-mpc', originRelative: true } });
    expect(
      earthLayer.enabled(state, NEAR_CTX, {
        slab: worldMpcView,
        vp: new Float32Array(16),
        camPos: [0, 0, 0],
        viewportPx: [1, 1],
      }),
    ).toBe(false);
    expect(earthLayer.enabled(state, NEAR_CTX, makeEarthBodyView('mars'))).toBe(false);
    expect(earthLayer.enabled(state, NEAR_CTX, makeEarthBodyView('earth'))).toBe(true);
  });

  it('is false while earthRenderer is null and while bodies.earth is null; true with both set', () => {
    const renderer = { draw: vi.fn() };
    // Neither present. Bare ctx: the handle check short-circuits first.
    expect(earthLayer.enabled(makeState(null, null), CTX_STUB, VIEW_STUB)).toBe(false);
    // Renderer only (camera inside the gate — the body is the missing gate).
    expect(earthLayer.enabled(makeState(renderer, null), NEAR_CTX, VIEW_STUB)).toBe(false);
    // Body only. Bare ctx: the handle check short-circuits first.
    expect(earthLayer.enabled(makeState(null, SEEDED_EARTH), CTX_STUB, VIEW_STUB)).toBe(false);
    // Both present, camera inside the gate.
    expect(earthLayer.enabled(makeState(renderer, SEEDED_EARTH), NEAR_CTX, VIEW_STUB)).toBe(true);
  });

  it('is disabled beyond the foreground gate and enabled below it', () => {
    const state = makeState({ draw: vi.fn() }, SEEDED_EARTH);
    // Below the gate → the handle + body gates decide (both pass).
    expect(earthLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2), VIEW_STUB)).toBe(
      true,
    );
    // At and above the gate → off, however present the handles are: Earth is
    // a deep-sub-pixel speck at the galactic centre. Both the gate edge and a
    // full decade beyond it (cosmic scale) are derived, so the seed roster
    // growing the gate carries this assertion instead of stranding a literal.
    expect(earthLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC), VIEW_STUB)).toBe(false);
    expect(earthLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC * 10), VIEW_STUB)).toBe(
      false,
    );
  });

  it('is disabled while Earth is sub-pixel, even inside the foreground band', () => {
    // Camera inside the foreground gate (cam.distance small) but positioned
    // ~1e-6 Mpc from Earth — the ~4e-16 Mpc globe subtends ~3e-7 px there,
    // far under SUB_PIXEL_BODY_CULL_PX, so the layer must leave the pass
    // plan: a sub-pixel sphere adds nothing the star backdrop doesn't.
    const state = makeState({ draw: vi.fn() }, SEEDED_EARTH);
    const drawCamPos: Vec3 = [
      SEEDED_EARTH.positionMpc[0] + 1e-6,
      SEEDED_EARTH.positionMpc[1],
      SEEDED_EARTH.positionMpc[2],
    ];
    const subPixelCtx = {
      cam: {
        distance: FOREGROUND_MAX_DISTANCE_MPC / 2,
        position: drawCamPos,
        target: SEEDED_EARTH.positionMpc,
      },
      drawCamPos,
      bodyPose: makeBodyPose(drawCamPos, SEEDED_EARTH.positionMpc),
      canvasSize: { width: 1280, height: 720 },
      fovYRad: (60 * Math.PI) / 180,
    } as unknown as ReadyFrameContext;
    expect(earthLayer.enabled(state, subPixelCtx, VIEW_STUB)).toBe(false);
  });
});

describe("the (foreground:0, 'body') render group above the foreground gate", () => {
  it('empties above the gate and is non-empty below it (the wholesale-skip property)', () => {
    // The SAME group filter executeFrame's render step applies: (target, slab)
    // match + the layer's own enabled gate. An empty group means the executor
    // never opens the foreground render pass, and the untouched foreground:0
    // source then skips its composite too. Earth's handle + body are present;
    // the sibling handles are null (their handle gates short-circuit).
    const state = {
      gpu: {
        earthRenderer: { draw: vi.fn() },
        starRenderer: null,
        // The field-star sphere shares this group; its presence query reads the
        // catalog off this handle, so a null handle short-circuits its enabled
        // gate and keeps it out below and above the gate (like the siblings).
        starCatalogRenderer: null,
        planetRenderer: null,
        texturedBodyRenderer: null,
        // The ring shares this group; its null handle short-circuits enabled, so
        // it stays out of the group below and above the gate (like the siblings).
        ringRenderer: null,
        // Earth's cloud shell also shares this group; same null-handle
        // short-circuit keeps it out below and above the gate.
        cloudShellRenderer: null,
        // Earth's in-scatter atmosphere shares this group too (drawn last); same
        // null-handle short-circuit keeps it out below and above the gate.
        atmosphereShellRenderer: null,
      },
      data: { bodies: { earth: SEEDED_EARTH, planets: [], stars: [] } },
    } as unknown as EngineState;
    const groupAt = (ctx: ReadyFrameContext) =>
      CONTENT_LAYERS.filter(
        (l) =>
          l.target === 'foreground:0' &&
          (l.slab === 'body' || l.slab === VIEW_STUB.slab.index) &&
          l.enabled(state, ctx, VIEW_STUB),
      );

    // Below the gate: earth draws (its gates pass), so the group is
    // non-empty and the foreground pass runs.
    expect(groupAt(makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2)).map((l) => l.name)).toEqual(['earth']);
    // Above the gate: EVERY foreground:0 layer is off — the group is empty
    // and the executor skips the pass + composite wholesale.
    expect(groupAt(makeCtx(FOREGROUND_MAX_DISTANCE_MPC))).toEqual([]);
    expect(groupAt(makeCtx(FOREGROUND_MAX_DISTANCE_MPC * 10))).toEqual([]);
  });
});

describe('prepareBodySurfaceFrame', () => {
  it('returns null when bodies.earth is null', () => {
    const state = makeState({ draw: vi.fn() }, null);
    const ctx = makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2);
    expect(prepareBodySurfaceFrame(state, ctx, makeEarthBodyView('earth'))).toBeNull();
  });

  it('composes mvpLocal from the slab f64 vp, not the f32 vp', () => {
    mvpMock.mockClear();
    const state = makeState({ draw: vi.fn() }, SEEDED_EARTH);
    const ctx = makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2);
    const view = makeEarthBodyView('earth');

    prepareBodySurfaceFrame(state, ctx, view);

    expect(mvpMock).toHaveBeenCalledTimes(1);
    const call = mvpMock.mock.calls[0]!;
    expect(call[0]).toBe(view.slab.vp);
    expect(call[0]).not.toBe(view.vp);
  });

  it('memoizes per (ctx, body): same object for a repeat call, a DIFFERENT object and pose for a second bodyId on the same ctx', () => {
    mvpMock.mockClear();
    const state: EngineState = {
      ...makeState({ draw: vi.fn() }, SEEDED_EARTH),
      data: { bodies: { earth: SEEDED_EARTH, planets: [SEEDED_MARS], stars: [] } },
    } as unknown as EngineState;
    const ctx = makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2);
    const earthView = makeEarthBodyView('earth');
    const marsView = makeEarthBodyView('mars');

    const first = prepareBodySurfaceFrame(state, ctx, earthView);
    const second = prepareBodySurfaceFrame(state, ctx, earthView);
    expect(second).toBe(first);

    // The load-bearing half: a ctx-keyed-only memo would return Earth's
    // frame for Mars here — assert a genuinely different object AND a
    // different pose/body, not just a different reference.
    const third = prepareBodySurfaceFrame(state, ctx, marsView);
    expect(third).not.toBe(first);
    expect(third!.body.id).toBe('mars');
    expect(third!.pose).not.toBe(first!.pose);
    expect(third!.bodyState.positionMpc).toBe(SEEDED_MARS.positionMpc);
  });
});

describe('earthLayer.draw', () => {
  it('draws the seeded earth via composeBodySlabMvp with the slab f64 vp', () => {
    mvpMock.mockClear();
    camLocalMock.mockClear();
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const view = makeEarthBodyView('earth');
    const state = makeState({ draw: drawSpy }, SEEDED_EARTH);

    // A camera comfortably inside the shared foreground gate, well above the
    // cloud-shadow descent-fade band (see the note on NEAR_CTX). Fresh per
    // this test, not the shared NEAR_CTX — this test's `toHaveBeenCalledTimes(1)`
    // assertion needs its OWN `prepareBodySurfaceFrame` memo entry, not one
    // another test using the same ctx object already primed.
    const ctx = makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2);
    earthLayer.draw(PASS_STUB, view, ctx, state);

    // Exactly one MVP composed for the single Earth body.
    expect(mvpMock).toHaveBeenCalledTimes(1);
    const call = mvpMock.mock.calls[0]!;
    // The load-bearing seam: first arg is the slab's Float64Array vp, NOT view.vp.
    expect(call[0]).toBe(view.slab.vp);
    expect(call[0]).not.toBe(view.vp);
    // The body's true equatorial radius in metres, not an Mpc conversion.
    expect(call[2]).toBe(SEEDED_EARTH.radiusM);

    expect(camLocalMock).toHaveBeenCalledTimes(1);
    expect(camLocalMock.mock.calls[0]![1]).toBe(SEEDED_EARTH.radiusM);

    // The renderer receives the pass + the packed length-32 EarthSurfaceUniforms
    // record (16 mvp + 3 sunDirLocal + roughnessBase + 3 camPosLocal + f0 +
    // sunIrradiance + cloudShadowStrength + cloudShellRadius + ambientLight +
    // oceanRoughness + 3 pad), not the bare 16-float MVP.
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const [passArg, uniforms] = drawSpy.mock.calls[0]! as [GPURenderPassEncoder, Float32Array];
    expect(passArg).toBe(PASS_STUB);
    expect(uniforms).toBeInstanceOf(Float32Array);
    expect(uniforms).toHaveLength(32);
  });

  it('packs sunDirLocal into the lit uniform', () => {
    // The lit-body seam: earthLayer must rotate the sun direction into Earth's
    // local frame (via the sunDirLocal util with Earth's baked orientation and
    // the render origin) and pack it at f32 slots 16..18 (bytes 64..75). We pin
    // it by recomputing sunDirLocal independently — NOT through the layer — so a
    // drift in the layer's rotate/pack lands as a failure here.
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const view = makeEarthBodyView('earth');
    const state = makeState({ draw: drawSpy }, SEEDED_EARTH);

    // Fresh ctx (see the previous test's note): this test's own
    // `toHaveBeenCalledTimes(1)` assertion needs its own
    // `prepareBodySurfaceFrame` memo entry, not NEAR_CTX's shared one.
    const ctx = makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2);
    earthLayer.draw(PASS_STUB, view, ctx, state);

    const [, uniforms] = drawSpy.mock.calls[0]! as [GPURenderPassEncoder, Float32Array];
    expect(uniforms).toHaveLength(32);
    const expected = sunDirLocal(
      SEEDED_EARTH.positionMpc,
      RENDER_ORIGIN_MPC,
      SEEDED_EARTH.orientation,
    );
    expect(uniforms[16]).toBeCloseTo(expected[0]);
    expect(uniforms[17]).toBeCloseTo(expected[1]);
    expect(uniforms[18]).toBeCloseTo(expected[2]);
  });

  it('packs the mocked camLocal and the PBR surface params into their tail slots', () => {
    // The other view-dependent seam: the ocean glint needs the camera in Earth's
    // local frame (slots 20..22), and the PBR + cloud dials fill the vec3 tails /
    // trailing scalars — roughnessBase at 19, f0 at 23, sunIrradiance at 24,
    // cloudShadowStrength at 25, cloudShellRadius at 26. Pinning the scalars by
    // their named source makes an argument-order swap at the pack call (e.g.
    // f0 ↔ roughnessBase, or the cloudShadowStrength ↔ cloudShellRadius wiring)
    // a failure here, not a visual-only regression.
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const view = makeEarthBodyView('earth');
    const state = makeState({ draw: drawSpy }, SEEDED_EARTH);

    const ctx = makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2);
    earthLayer.draw(PASS_STUB, view, ctx, state);

    const [, uniforms] = drawSpy.mock.calls[0]! as [GPURenderPassEncoder, Float32Array];
    expect(uniforms).toHaveLength(32);

    // MOCK_CAM_LOCAL is the mocked bodySlabCamLocal's fixed return value —
    // the layer must forward it byte-for-byte (f32-narrowed) into slots 20..22.
    expect(uniforms[20]).toBe(Math.fround(MOCK_CAM_LOCAL[0]));
    expect(uniforms[21]).toBe(Math.fround(MOCK_CAM_LOCAL[1]));
    expect(uniforms[22]).toBe(Math.fround(MOCK_CAM_LOCAL[2]));

    expect(uniforms[19]).toBeCloseTo(EARTH_SURFACE_PARAMS.roughnessBase);
    expect(uniforms[23]).toBeCloseTo(EARTH_SURFACE_PARAMS.f0);
    expect(uniforms[24]).toBeCloseTo(EARTH_SURFACE_PARAMS.sunIrradiance);
    expect(uniforms[25]).toBeCloseTo(EARTH_SURFACE_PARAMS.cloudShadowStrength);
    // Slot 26 is the cloud shell radius the surface shadow ray intersects — it
    // must be the real CLOUD_SHELL_PARAMS.radiusRatio.
    expect(uniforms[26]).toBeCloseTo(CLOUD_SHELL_PARAMS.radiusRatio);
    // Slots 27..28 are the live settings overrides the layer reads from
    // state.settings.earth — the night-side ambient floor and the open-water GGX
    // roughness. The fixture seeds both from EARTH_SURFACE_PARAMS (a no-op
    // override), so the packed slots equal those authored defaults; a stray
    // ambientLight ↔ oceanRoughness swap at the pack call lands as a failure here.
    expect(uniforms[27]).toBeCloseTo(EARTH_SURFACE_PARAMS.ambientLight);
    expect(uniforms[28]).toBeCloseTo(EARTH_SURFACE_PARAMS.oceanRoughness);
  });

  it('scales cloudShadowStrength by the descent fade as the camera nears the surface', () => {
    // A future refactor could drop the fade multiply at the pack call and no
    // OTHER test here would notice — the three tests above all sit far above
    // the fade band, where the multiplier is 1 and indistinguishable from its
    // absence. This one plants the camera INSIDE the band (the fade's own
    // edges from CLOUD_SHELL_PARAMS, not restated literals), so the packed
    // slot 25 must land strictly between 0 and the authored dial.
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const view = makeEarthBodyView('earth');
    const state = makeState({ draw: drawSpy }, SEEDED_EARTH);
    const radiusMpc = SEEDED_EARTH.radiusM * SCALE_UNITS.M_TO_MPC;
    const midAltitudeRadii =
      (CLOUD_SHELL_PARAMS.fadeStartAltitudeRadii + CLOUD_SHELL_PARAMS.fadeEndAltitudeRadii) / 2;
    const drawCamPos: Vec3 = [
      SEEDED_EARTH.positionMpc[0] + radiusMpc * (1 + midAltitudeRadii),
      SEEDED_EARTH.positionMpc[1],
      SEEDED_EARTH.positionMpc[2],
    ];
    const closeCtx = {
      cam: {
        distance: FOREGROUND_MAX_DISTANCE_MPC / 2,
        position: drawCamPos,
        target: SEEDED_EARTH.positionMpc,
      },
      drawCamPos,
      bodyPose: makeBodyPose(drawCamPos, SEEDED_EARTH.positionMpc),
      canvasSize: { width: 1280, height: 720 },
      fovYRad: (60 * Math.PI) / 180,
    } as unknown as ReadyFrameContext;

    earthLayer.draw(PASS_STUB, view, closeCtx, state);

    const [, uniforms] = drawSpy.mock.calls[0]! as [GPURenderPassEncoder, Float32Array];
    expect(uniforms[25]).toBeGreaterThan(0);
    expect(uniforms[25]).toBeLessThan(EARTH_SURFACE_PARAMS.cloudShadowStrength);
  });

  it('is a no-op when the earthRenderer handle is null (pre-bootstrap)', () => {
    const view = makeEarthBodyView('earth');
    const state = makeState(null, SEEDED_EARTH);
    expect(() => earthLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });

  it('is a no-op when bodies.earth is null (unseeded)', () => {
    const view = makeEarthBodyView('earth');
    const state = makeState({ draw: vi.fn() }, null);
    expect(() => earthLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });
});

describe('earthLayer.draw — detail tiles', () => {
  // A minimal stand-in for `SurfaceCutTile` — `earthLayer.draw` forwards it
  // opaquely to `earthSurfaceTileRenderer.draw`, never reading its fields.
  const STUB_CUT = [
    {
      id: { z: 8, x: 1, y: 1 },
      originLocal: [1, 0, 0],
      resident: {
        slot: 0,
        atlasUvOrigin: [0, 0],
        atlasUvScale: [0.1, 0.1],
        readyAtMs: 0,
        fallback: null,
      },
    },
  ];
  const ATLAS_VIEW = {} as GPUTextureView;

  it('draws the tile renderer AFTER the base globe, forwarding the eye-relative pose and the un-rebased view.vp', () => {
    mvpMock.mockClear();
    const order: string[] = [];
    const baseDraw = vi.fn(() => order.push('base'));
    const tileDraw = vi.fn<(pass: GPURenderPassEncoder, args: EarthSurfaceTileDrawArgs) => void>(
      () => order.push('tiles'),
    );
    const view = makeEarthBodyView('earth');
    const state = makeTileDrawState({
      tileRenderer: { draw: tileDraw },
      cut: STUB_CUT,
      atlasView: ATLAS_VIEW,
    });
    (state.gpu as unknown as { earthRenderer: { draw: typeof baseDraw } }).earthRenderer.draw =
      baseDraw;

    earthLayer.draw(PASS_STUB, view, NEAR_CTX, state);

    expect(baseDraw).toHaveBeenCalledTimes(1);
    expect(tileDraw).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['base', 'tiles']);

    const [pass, args] = tileDraw.mock.calls[0]!;
    expect(pass).toBe(PASS_STUB);
    expect(args.tiles).toBe(STUB_CUT);
    expect(args.surfaceAtlasView).toBe(ATLAS_VIEW);
    expect(typeof args.frame).toBe('number');
    // No rebase: the tile draw's vp is the slab's own already-eye-relative
    // f32 view (view.vp), never a freshly narrowed/rebased copy.
    expect(args.vp).toBe(view.vp);
    expect(args.radiusM).toBe(SEEDED_EARTH.radiusM);
    // The eyeRelBodyM the base globe's mvp/camLocal composed from — same
    // pose, no separate re-derivation for the tile draw.
    expect(mvpMock.mock.calls[0]![1]).toBe(args.eyeRelBodyM);
  });

  it("packs the live debug.overlays['earth-lod-overlay'] toggle into the tile draw args", () => {
    // The DebugPanel toggle must reach the tile renderer every draw, not just
    // on change — the fixture's two states below stand in for a checkbox
    // flip between frames.
    const tileDraw = vi.fn<(pass: GPURenderPassEncoder, args: EarthSurfaceTileDrawArgs) => void>();
    const view = makeEarthBodyView('earth');
    const state = makeTileDrawState({
      tileRenderer: { draw: tileDraw },
      cut: STUB_CUT,
      atlasView: ATLAS_VIEW,
    });

    earthLayer.draw(PASS_STUB, view, NEAR_CTX, state);
    expect(tileDraw.mock.calls[0]![1].debugLodOverlay).toBe(false);

    (state.settings as unknown as { debug: { overlays: Record<string, boolean> } }).debug.overlays[
      'earth-lod-overlay'
    ] = true;
    earthLayer.draw(PASS_STUB, view, NEAR_CTX, state);
    expect(tileDraw.mock.calls[1]![1].debugLodOverlay).toBe(true);
  });

  it('does not draw the tile renderer when the cut is empty (nothing resident yet)', () => {
    const tileDraw = vi.fn();
    const view = makeEarthBodyView('earth');
    const state = makeTileDrawState({
      tileRenderer: { draw: tileDraw },
      cut: [],
      atlasView: ATLAS_VIEW,
    });

    earthLayer.draw(PASS_STUB, view, NEAR_CTX, state);

    expect(tileDraw).not.toHaveBeenCalled();
  });

  it('does not draw the tile renderer when the atlas has not engaged yet', () => {
    const tileDraw = vi.fn();
    const view = makeEarthBodyView('earth');
    const state = makeTileDrawState({
      tileRenderer: { draw: tileDraw },
      cut: STUB_CUT,
      atlasView: null,
    });

    earthLayer.draw(PASS_STUB, view, NEAR_CTX, state);

    expect(tileDraw).not.toHaveBeenCalled();
  });

  it('does not draw when the earthSurfaceTileRenderer GPU handle is null (pre-bootstrap)', () => {
    const view = makeEarthBodyView('earth');
    const state = makeTileDrawState({ tileRenderer: null, cut: STUB_CUT, atlasView: ATLAS_VIEW });

    expect(() => earthLayer.draw(PASS_STUB, view, NEAR_CTX, state)).not.toThrow();
  });
});

describe('earthLayer.draw — base globe fade under the tile cut', () => {
  // A minimal stand-in cut, reused from the detail-tiles suite above.
  const STUB_CUT = [
    {
      id: { z: 8, x: 1, y: 1 },
      originLocal: [1, 0, 0],
      resident: {
        slot: 0,
        atlasUvOrigin: [0, 0],
        atlasUvScale: [0.1, 0.1],
        readyAtMs: 0,
        fallback: null,
      },
    },
  ];
  const ATLAS_VIEW = {} as GPUTextureView;

  /** ctx whose `drawCamPos` sits `altitudeKm` above Earth's surface along
   *  +x — the shared fixture for the fade tests below. */
  function makeAltitudeCtx(altitudeKm: number): ReadyFrameContext {
    const radiusMpc = SEEDED_EARTH.radiusM * SCALE_UNITS.M_TO_MPC;
    const altitudeMpc = altitudeKm * SCALE_UNITS.KM_TO_MPC;
    const drawCamPos: Vec3 = [
      SEEDED_EARTH.positionMpc[0] + radiusMpc + altitudeMpc,
      SEEDED_EARTH.positionMpc[1],
      SEEDED_EARTH.positionMpc[2],
    ];
    return {
      cam: {
        distance: FOREGROUND_MAX_DISTANCE_MPC / 2,
        position: drawCamPos,
        target: SEEDED_EARTH.positionMpc,
      },
      drawCamPos,
      bodyPose: makeBodyPose(drawCamPos, SEEDED_EARTH.positionMpc),
      canvasSize: { width: 1280, height: 720 },
      fovYRad: (60 * Math.PI) / 180,
    } as unknown as ReadyFrameContext;
  }

  /** Installs a spy on `state.gpu.earthRenderer.draw`, replacing the
   *  `vi.fn()` `makeTileDrawState` seeds it with. */
  function spyOnBaseDraw(state: EngineState): ReturnType<typeof vi.fn> {
    const baseDraw = vi.fn();
    (state.gpu as unknown as { earthRenderer: { draw: typeof baseDraw } }).earthRenderer.draw =
      baseDraw;
    return baseDraw;
  }

  it('forwards alpha 1 when the cut is empty, regardless of altitude', () => {
    const view = makeEarthBodyView('earth');
    const state = makeTileDrawState({
      tileRenderer: { draw: vi.fn() },
      cut: [],
      atlasView: ATLAS_VIEW,
    });
    const baseDraw = spyOnBaseDraw(state);

    // Deep inside what would be the alpha-0 band if the fade engaged — the
    // empty cut must keep the base globe at the alpha-1 failure floor.
    const ctx = makeAltitudeCtx(EARTH_BASE_GLOBE_FADE_GONE_ALTITUDE_KM / 2);
    earthLayer.draw(PASS_STUB, view, ctx, state);

    expect(baseDraw).toHaveBeenCalledTimes(1);
    const uniforms = baseDraw.mock.calls[0]![1] as Float32Array;
    expect(uniforms[29]).toBe(1);
  });

  it('skips the base-globe draw call at alpha 0 with a non-empty cut', () => {
    const view = makeEarthBodyView('earth');
    const tileDraw = vi.fn();
    const state = makeTileDrawState({
      tileRenderer: { draw: tileDraw },
      cut: STUB_CUT,
      atlasView: ATLAS_VIEW,
    });
    const baseDraw = spyOnBaseDraw(state);

    const ctx = makeAltitudeCtx(EARTH_BASE_GLOBE_FADE_GONE_ALTITUDE_KM / 2);
    earthLayer.draw(PASS_STUB, view, ctx, state);

    expect(baseDraw).not.toHaveBeenCalled();
    // The tiles cover the whole cap by now — they must still draw.
    expect(tileDraw).toHaveBeenCalledTimes(1);
  });

  it('forwards a fractional alpha at the fade band midpoint', () => {
    const view = makeEarthBodyView('earth');
    const state = makeTileDrawState({
      tileRenderer: { draw: vi.fn() },
      cut: STUB_CUT,
      atlasView: ATLAS_VIEW,
    });
    const baseDraw = spyOnBaseDraw(state);

    const midAltitudeKm =
      (EARTH_BASE_GLOBE_FADE_FULL_ALTITUDE_KM + EARTH_BASE_GLOBE_FADE_GONE_ALTITUDE_KM) / 2;
    earthLayer.draw(PASS_STUB, view, makeAltitudeCtx(midAltitudeKm), state);

    expect(baseDraw).toHaveBeenCalledTimes(1);
    const uniforms = baseDraw.mock.calls[0]![1] as Float32Array;
    expect(uniforms[29]).toBeGreaterThan(0);
    expect(uniforms[29]).toBeLessThan(1);
  });
});

describe('earthLayer.drawPick', () => {
  it('floors the pick radius and composes mvp/camLocal from the SAME floored radius', () => {
    mvpMock.mockClear();
    camLocalMock.mockClear();
    const drawSphere = vi.fn();
    const view = makeEarthBodyView('earth');
    // Far enough out that the BODY_PICK_MIN_RADIUS_PX floor exceeds Earth's
    // true radius — the far-edge-of-the-foreground-band case the floor exists
    // for (see minPickRadiusMpc's header).
    const ctx = makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2);
    const state = {
      ...makeState({ draw: vi.fn() }, SEEDED_EARTH),
      gpu: { earthRenderer: { draw: vi.fn() }, bodyPickRenderer: { drawSphere } },
    } as unknown as EngineState;

    earthLayer.drawPick!(PASS_STUB, view, ctx, state);

    expect(drawSphere).toHaveBeenCalledTimes(1);
    const [pass, args] = drawSphere.mock.calls[0]! as [
      GPURenderPassEncoder,
      { mvp: Float32Array; camPosLocal: Vec3; packedId: number },
    ];
    expect(pass).toBe(PASS_STUB);
    expect(args.packedId).toBe(packSelection(Source.Earth, 0 + PICK_SENTINEL_OFFSET));

    // Two composes each: `prepareBodySurfaceFrame` (called internally, base
    // radius) and drawPick's own floored-radius pair — the SECOND call of
    // each is the pick one, and it MUST share one floored radius, the
    // invariant drawFlooredSpherePick's header names, reproduced here
    // directly against the body-slab primitives.
    expect(mvpMock).toHaveBeenCalledTimes(2);
    expect(camLocalMock).toHaveBeenCalledTimes(2);
    const pickRadiusM = mvpMock.mock.calls[1]![2] as number;
    expect(camLocalMock.mock.calls[1]![1]).toBe(pickRadiusM);
    expect(pickRadiusM).toBeGreaterThan(SEEDED_EARTH.radiusM);

    // Independently recomputed floor formula.
    const dM = Math.hypot(
      mvpMock.mock.calls[1]![1][0],
      mvpMock.mock.calls[1]![1][1],
      mvpMock.mock.calls[1]![1][2],
    );
    const expectedFloor = Math.max(
      SEEDED_EARTH.radiusM,
      (BODY_PICK_MIN_RADIUS_PX / ctx.drawPxPerRad) * dM,
    );
    expect(pickRadiusM).toBeCloseTo(expectedFloor, 6);
  });

  it('is a no-op when the bodyPickRenderer handle is null', () => {
    const view = makeEarthBodyView('earth');
    const state = {
      ...makeState({ draw: vi.fn() }, SEEDED_EARTH),
      gpu: { bodyPickRenderer: null },
    };
    expect(() =>
      earthLayer.drawPick!(PASS_STUB, view, NEAR_CTX, state as unknown as EngineState),
    ).not.toThrow();
  });

  it('is a no-op when bodies.earth is null (unseeded)', () => {
    const view = makeEarthBodyView('earth');
    const state = {
      ...makeState({ draw: vi.fn() }, null),
      gpu: { bodyPickRenderer: { drawSphere: vi.fn() } },
    } as unknown as EngineState;
    expect(() => earthLayer.drawPick!(PASS_STUB, view, NEAR_CTX, state)).not.toThrow();
  });
});
