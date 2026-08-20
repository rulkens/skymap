/**
 * earthLayer — unit tests for the true-scale Earth content row.
 *
 * Like the other sphere-body layers, the load-bearing assertion is the f64 seam: the
 * layer MUST feed `composeBodyMvp` the slab's `Float64Array` view-projection
 * (`view.slab.vp`), NOT the f32-narrowed `view.vp` the other layers consume.
 * Earth sits ~1 AU ≈ 4.85e-12 Mpc from the render origin, a tiny number the
 * VP's large translation nearly cancels — resolving that cancellation in f32
 * (after the low-order bits are gone) would mis-place Earth by more than its
 * own radius. We pin it by identity: a mocked `composeBodyMvp` whose first
 * argument must `toBe(view.slab.vp)`, where the fixture's `slab.vp` is a
 * recognisable `Float64Array` and `vp` is a deliberately different
 * `Float32Array`.
 *
 * The layer also gates on TWO handles — the `earthRenderer` GPU handle and the
 * seeded `bodies.earth` record — so `enabled` is false until both are present,
 * AND on the shared near-field distance gate (`FOREGROUND_MAX_DISTANCE_MPC`).
 * This suite carries the representative executor-group check: above the gate
 * the whole `(foreground:0, NEAR0)` group must come back empty from the SAME
 * filter `executeFrame` uses, which is what lets the frame skip the
 * foreground render pass + its composite wholesale at galaxy zoom.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  earthLayer,
  prepareEarthFrame,
} from '../../../../../src/services/engine/frame/passes/earthLayer';
import { CONTENT_LAYERS } from '../../../../../src/services/engine/frame/passes';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCENE_EARTH } from '../../../../../src/data/bodies/sceneEarth';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { sunDirLocal } from '../../../../../src/utils/camera/sunDirLocal';
import { camPosLocal } from '../../../../../src/utils/camera/camPosLocal';
import { EARTH_SURFACE_PARAMS } from '../../../../../src/data/bodies/earthSurfaceParams';
import { CLOUD_SHELL_PARAMS } from '../../../../../src/data/bodies/cloudShellParams';
import {
  EARTH_BASE_GLOBE_FADE_FULL_ALTITUDE_KM,
  EARTH_BASE_GLOBE_FADE_GONE_ALTITUDE_KM,
} from '../../../../../src/data/bodies/earthTileParams';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { EarthBody } from '../../../../../src/@types/scene/EarthBody';
import type { BodyState } from '../../../../../src/@types/scene/BodyState';
import type { EarthSurfaceTileDrawArgs } from '../../../../../src/@types/rendering/EarthSurfaceTileRenderer';

// Mock composeBodyMvp so the test can (a) assert which vp it consumed by
// object identity and (b) hand the renderer a recognisable Float32Array. The
// real composition math is covered by composeBodyMvp's own tests.
vi.mock('../../../../../src/utils/camera/composeBodyMvp', () => ({
  composeBodyMvp: vi.fn<() => Float32Array>(() => new Float32Array(16)),
}));
import { composeBodyMvp } from '../../../../../src/utils/camera/composeBodyMvp';

// The layer reads Earth's live position/orientation from the per-frame body-state
// snapshot (keyed by id). Stub it to a map holding the seeded Earth, REUSING the
// SeededEarth fixture's own positionMpc/orientation refs — so the layer sees the
// exact fixture values (identity-equal), keeping the `toBe(...)` assertions below
// intact while the reads move off the baked record fields.
vi.mock('../../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn((state: EngineState): ReadonlyMap<string, BodyState> => {
    const m = new Map<string, BodyState>();
    const earth = state.data.bodies.earth as SeededEarth | null;
    if (earth)
      m.set(earth.id, {
        positionMpc: earth.positionMpc,
        orientation: earth.orientation,
        meanAnomalyRad: 0,
      });
    return m;
  }),
}));

// A test fixture pairing Earth's identity record with the J2000 state the
// snapshot carries — position + orientation were lifted off the record onto the
// derive, so the fixture supplies them here (sourced from the derive, so the
// values are the real J2000 ones and the refs stay stable across the assertions).
type SeededEarth = EarthBody & Pick<BodyState, 'positionMpc' | 'orientation'>;
const EARTH_STATE = deriveBodyStates(CONST_J2000).get('earth')!;
const SEEDED_EARTH: SeededEarth = {
  ...SCENE_EARTH,
  positionMpc: EARTH_STATE.positionMpc,
  orientation: EARTH_STATE.orientation,
};

const composeMock = composeBodyMvp as unknown as ReturnType<typeof vi.fn>;

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

// Beyond the handle checks, enabled reads ctx.cam.distance (the shared
// foreground gate — orbit distance-to-focus) AND the camera POSITION +
// projection knobs (the sub-pixel cull — a separate quantity). The fixture
// camera hovers 1e-13 Mpc from Earth's centre, where the ~4e-16 Mpc globe
// subtends ~2.6 px on this 720-tall/60° viewport, so the cull passes and the
// `distance` argument alone drives the foreground-gate assertions.
function makeCtx(distance: number): ReadyFrameContext {
  return {
    cam: { distance },
    drawCamPos: [
      SEEDED_EARTH.positionMpc[0] + 1e-13,
      SEEDED_EARTH.positionMpc[1],
      SEEDED_EARTH.positionMpc[2],
    ],
    canvasSize: { width: 1280, height: 720 },
    fovYRad: (60 * Math.PI) / 180,
  } as unknown as ReadyFrameContext;
}

// A camera comfortably inside the shared foreground gate. Reused by reference
// where safe; the first three `earthLayer.draw` tests below call `makeCtx`
// fresh instead — `prepareEarthFrame`'s ctx-keyed memo would otherwise let
// the second and third hit the cache the first one primed (same NEAR_CTX
// object ⇒ same memo entry ⇒ composeBodyMvp not re-invoked, and the first
// test's `toHaveBeenCalledTimes(1)` would misattribute the shared call).
const NEAR_CTX = makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2);

/**
 * A SlabView whose f64 `slab.vp` and f32 `vp` are deliberately DIFFERENT
 * arrays, so a first-arg identity check unambiguously reveals which one the
 * layer fed to composeBodyMvp. The f64 array carries recognisable non-zero
 * values; the f32 array is left as a distinct all-zero Float32Array.
 */
function makeNear0View(): SlabView {
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
    camPos: [0, 0, 5],
    viewportPx: [1280, 720],
  };
}

/** State whose `earthRenderer` handle + `bodies.earth` record are both set. */
function makeState(earthRenderer: unknown, earth: EarthBody | null): EngineState {
  return {
    gpu: { earthRenderer },
    data: { bodies: { earth } },
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

describe('earthLayer.enabled', () => {
  it('is false while earthRenderer is null and while bodies.earth is null; true with both set', () => {
    const renderer = { draw: vi.fn() };
    // Neither present. Bare ctx: the handle check short-circuits first.
    expect(earthLayer.enabled(makeState(null, null), CTX_STUB)).toBe(false);
    // Renderer only (camera inside the gate — the body is the missing gate).
    expect(earthLayer.enabled(makeState(renderer, null), NEAR_CTX)).toBe(false);
    // Body only. Bare ctx: the handle check short-circuits first.
    expect(earthLayer.enabled(makeState(null, SEEDED_EARTH), CTX_STUB)).toBe(false);
    // Both present, camera inside the gate.
    expect(earthLayer.enabled(makeState(renderer, SEEDED_EARTH), NEAR_CTX)).toBe(true);
  });

  it('is disabled beyond the foreground gate and enabled below it', () => {
    const state = makeState({ draw: vi.fn() }, SEEDED_EARTH);
    // Below the gate → the handle + body gates decide (both pass).
    expect(earthLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2))).toBe(true);
    // At and above the gate → off, however present the handles are: Earth is
    // a deep-sub-pixel speck at the galactic centre. Both the gate edge and a
    // full decade beyond it (cosmic scale) are derived, so the seed roster
    // growing the gate carries this assertion instead of stranding a literal.
    expect(earthLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC))).toBe(false);
    expect(earthLayer.enabled(state, makeCtx(FOREGROUND_MAX_DISTANCE_MPC * 10))).toBe(false);
  });

  it('is disabled while Earth is sub-pixel, even inside the foreground band', () => {
    // Camera inside the foreground gate (cam.distance small) but positioned
    // ~1e-6 Mpc from Earth — the ~4e-16 Mpc globe subtends ~3e-7 px there,
    // far under SUB_PIXEL_BODY_CULL_PX, so the layer must leave the pass
    // plan: a sub-pixel sphere adds nothing the star backdrop doesn't.
    const state = makeState({ draw: vi.fn() }, SEEDED_EARTH);
    const subPixelCtx = {
      cam: { distance: FOREGROUND_MAX_DISTANCE_MPC / 2 },
      drawCamPos: [
        SEEDED_EARTH.positionMpc[0] + 1e-6,
        SEEDED_EARTH.positionMpc[1],
        SEEDED_EARTH.positionMpc[2],
      ],
      canvasSize: { width: 1280, height: 720 },
      fovYRad: (60 * Math.PI) / 180,
    } as unknown as ReadyFrameContext;
    expect(earthLayer.enabled(state, subPixelCtx)).toBe(false);
  });
});

describe('the (foreground:0, NEAR0) render group above the foreground gate', () => {
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
      data: { bodies: { earth: SEEDED_EARTH } },
    } as unknown as EngineState;
    const groupAt = (ctx: ReadyFrameContext) =>
      CONTENT_LAYERS.filter(
        (l) => l.target === 'foreground:0' && l.slab === NEAR0 && l.enabled(state, ctx),
      );

    // Below the gate: earth draws (its two gates pass), so the group is
    // non-empty and the foreground pass runs.
    expect(groupAt(makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2)).map((l) => l.name)).toEqual(['earth']);
    // Above the gate: EVERY foreground:0 layer is off — the group is empty
    // and the executor skips the pass + composite wholesale.
    expect(groupAt(makeCtx(FOREGROUND_MAX_DISTANCE_MPC))).toEqual([]);
    expect(groupAt(makeCtx(FOREGROUND_MAX_DISTANCE_MPC * 10))).toEqual([]);
  });
});

describe('prepareEarthFrame', () => {
  it('returns null when bodies.earth is null', () => {
    const state = makeState({ draw: vi.fn() }, null);
    const ctx = makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2);
    expect(prepareEarthFrame(state, ctx, makeNear0View())).toBeNull();
  });

  it('composes mvpLocal from the slab f64 vp, not the f32 vp', () => {
    composeMock.mockClear();
    const state = makeState({ draw: vi.fn() }, SEEDED_EARTH);
    const ctx = makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2);
    const view = makeNear0View();

    prepareEarthFrame(state, ctx, view);

    expect(composeMock).toHaveBeenCalledTimes(1);
    const call = composeMock.mock.calls[0]!;
    expect(call[0]).toBe(view.slab.vp);
    expect(call[0]).not.toBe(view.vp);
  });

  it('memoizes per ctx', () => {
    composeMock.mockClear();
    const state = makeState({ draw: vi.fn() }, SEEDED_EARTH);
    const ctx = makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2);
    const view = makeNear0View();

    const first = prepareEarthFrame(state, ctx, view);
    const second = prepareEarthFrame(state, ctx, view);

    expect(second).toBe(first);
    expect(composeMock).toHaveBeenCalledTimes(1);
  });
});

describe('earthLayer.draw', () => {
  it('draws the seeded earth via composeBodyMvp with the slab f64 vp', () => {
    composeMock.mockClear();
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const view = makeNear0View();
    const state = makeState({ draw: drawSpy }, SEEDED_EARTH);

    // A camera comfortably inside the shared foreground gate, well above the
    // cloud-shadow descent-fade band (see the note on NEAR_CTX). Fresh per
    // this test, not the shared NEAR_CTX — this test's `toHaveBeenCalledTimes(1)`
    // assertion needs its OWN `prepareEarthFrame` memo entry, not one another
    // test using the same ctx object already primed.
    const ctx = makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2);
    earthLayer.draw(PASS_STUB, view, ctx, state);

    // Exactly one MVP composed for the single Earth body.
    expect(composeMock).toHaveBeenCalledTimes(1);
    const call = composeMock.mock.calls[0]!;
    // The load-bearing seam: first arg is the slab's Float64Array vp, NOT view.vp.
    expect(call[0]).toBe(view.slab.vp);
    expect(call[0]).not.toBe(view.vp);
    // Position, render origin, and the km→Mpc radius carried through.
    expect(call[1]).toBe(SEEDED_EARTH.positionMpc);
    expect(call[2]).toBe(RENDER_ORIGIN_MPC);
    expect(call[3]).toBe(SEEDED_EARTH.radiusKm * SCALE_UNITS.KM_TO_MPC);
    // The body's baked orientation is forwarded as the model's rotation factor.
    expect(call[4]).toBe(SEEDED_EARTH.orientation);

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
    composeMock.mockClear();
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const view = makeNear0View();
    const state = makeState({ draw: drawSpy }, SEEDED_EARTH);

    // Fresh ctx (see the previous test's note): this test's own
    // `toHaveBeenCalledTimes(1)` assertion needs its own `prepareEarthFrame`
    // memo entry, not NEAR_CTX's shared one.
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

  it('packs camPosLocal and the PBR surface params into their tail slots', () => {
    // The other view-dependent seam: the ocean glint needs the camera in Earth's
    // local frame (slots 20..22), and the PBR + cloud dials fill the vec3 tails /
    // trailing scalars — roughnessBase at 19, f0 at 23, sunIrradiance at 24,
    // cloudShadowStrength at 25, cloudShellRadius at 26. Pinning the scalars by
    // their named source makes an argument-order swap at the pack call (e.g.
    // f0 ↔ roughnessBase, or the cloudShadowStrength ↔ cloudShellRadius wiring
    // this task introduces) a failure here, not a visual-only regression.
    composeMock.mockClear();
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const view = makeNear0View();
    const state = makeState({ draw: drawSpy }, SEEDED_EARTH);

    // Fresh ctx (see the first draw test's note): keeps this test's own
    // `prepareEarthFrame` memo entry separate from NEAR_CTX's.
    const ctx = makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2);
    earthLayer.draw(PASS_STUB, view, ctx, state);

    const [, uniforms] = drawSpy.mock.calls[0]! as [GPURenderPassEncoder, Float32Array];
    expect(uniforms).toHaveLength(32);

    // Independent recompute of the camera-in-local-frame vector. The fixture camera
    // sits 5 Mpc out while Earth's radius is ~2e-16 Mpc, so the local coords are
    // astronomically large (~1e16) — toBeCloseTo's absolute tolerance is meaningless
    // there. The layer and this recompute call the SAME util with identical inputs,
    // so the f32-narrowed slot equals Math.fround of the recomputed value exactly.
    const expectedCam = camPosLocal(
      view.camPos,
      SEEDED_EARTH.positionMpc,
      SEEDED_EARTH.radiusKm * SCALE_UNITS.KM_TO_MPC,
      SEEDED_EARTH.orientation,
    );
    expect(uniforms[20]).toBe(Math.fround(expectedCam[0]));
    expect(uniforms[21]).toBe(Math.fround(expectedCam[1]));
    expect(uniforms[22]).toBe(Math.fround(expectedCam[2]));

    expect(uniforms[19]).toBeCloseTo(EARTH_SURFACE_PARAMS.roughnessBase);
    expect(uniforms[23]).toBeCloseTo(EARTH_SURFACE_PARAMS.f0);
    expect(uniforms[24]).toBeCloseTo(EARTH_SURFACE_PARAMS.sunIrradiance);
    expect(uniforms[25]).toBeCloseTo(EARTH_SURFACE_PARAMS.cloudShadowStrength);
    // Slot 26 is the cloud shell radius the surface shadow ray intersects — it
    // must be the real CLOUD_SHELL_PARAMS.radiusRatio, not the placeholder 1.0
    // this task replaced (the shadow geometry and the drawn deck share it).
    expect(uniforms[26]).toBeCloseTo(CLOUD_SHELL_PARAMS.radiusRatio);
    // Slots 27..28 are the live settings overrides the layer now reads from
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
    const view = makeNear0View();
    const state = makeState({ draw: drawSpy }, SEEDED_EARTH);
    const radiusMpc = SEEDED_EARTH.radiusKm * SCALE_UNITS.KM_TO_MPC;
    const midAltitudeRadii =
      (CLOUD_SHELL_PARAMS.fadeStartAltitudeRadii + CLOUD_SHELL_PARAMS.fadeEndAltitudeRadii) / 2;
    const closeCtx = {
      cam: { distance: FOREGROUND_MAX_DISTANCE_MPC / 2 },
      drawCamPos: [
        SEEDED_EARTH.positionMpc[0] + radiusMpc * (1 + midAltitudeRadii),
        SEEDED_EARTH.positionMpc[1],
        SEEDED_EARTH.positionMpc[2],
      ],
      canvasSize: { width: 1280, height: 720 },
      fovYRad: (60 * Math.PI) / 180,
    } as unknown as ReadyFrameContext;

    earthLayer.draw(PASS_STUB, view, closeCtx, state);

    const [, uniforms] = drawSpy.mock.calls[0]! as [GPURenderPassEncoder, Float32Array];
    expect(uniforms[25]).toBeGreaterThan(0);
    expect(uniforms[25]).toBeLessThan(EARTH_SURFACE_PARAMS.cloudShadowStrength);
  });

  it('is a no-op when the earthRenderer handle is null (pre-bootstrap)', () => {
    const view = makeNear0View();
    const state = makeState(null, SEEDED_EARTH);
    expect(() => earthLayer.draw(PASS_STUB, view, CTX_STUB, state)).not.toThrow();
  });

  it('is a no-op when bodies.earth is null (unseeded)', () => {
    const view = makeNear0View();
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

  it('draws the tile renderer AFTER the base globe when the cut is non-empty and the atlas is live', () => {
    const order: string[] = [];
    const baseDraw = vi.fn(() => order.push('base'));
    const tileDraw = vi.fn<(pass: GPURenderPassEncoder, args: EarthSurfaceTileDrawArgs) => void>(
      () => order.push('tiles'),
    );
    const view = makeNear0View();
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
  });

  it("packs the live debug.overlays['earth-lod-overlay'] toggle into the tile draw args", () => {
    // The DebugPanel toggle must reach the tile renderer every draw, not just
    // on change — the fixture's two states below stand in for a checkbox
    // flip between frames.
    const tileDraw = vi.fn<(pass: GPURenderPassEncoder, args: EarthSurfaceTileDrawArgs) => void>();
    const view = makeNear0View();
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
    const view = makeNear0View();
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
    const view = makeNear0View();
    const state = makeTileDrawState({
      tileRenderer: { draw: tileDraw },
      cut: STUB_CUT,
      atlasView: null,
    });

    earthLayer.draw(PASS_STUB, view, NEAR_CTX, state);

    expect(tileDraw).not.toHaveBeenCalled();
  });

  it('does not draw when the earthSurfaceTileRenderer GPU handle is null (pre-bootstrap)', () => {
    const view = makeNear0View();
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
    const radiusMpc = SEEDED_EARTH.radiusKm * SCALE_UNITS.KM_TO_MPC;
    const altitudeMpc = altitudeKm * SCALE_UNITS.KM_TO_MPC;
    return {
      cam: { distance: FOREGROUND_MAX_DISTANCE_MPC / 2 },
      drawCamPos: [
        SEEDED_EARTH.positionMpc[0] + radiusMpc + altitudeMpc,
        SEEDED_EARTH.positionMpc[1],
        SEEDED_EARTH.positionMpc[2],
      ],
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
    const view = makeNear0View();
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
    const view = makeNear0View();
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
    const view = makeNear0View();
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
