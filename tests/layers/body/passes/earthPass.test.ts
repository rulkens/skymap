/**
 * earthPass — Earth's two `'body'`-slab content rows: the base globe (`earthPass`) and the
 * detail patches over it (`surfaceTilesPass`). One suite because the rows share every fixture.
 *
 * Load-bearing: the f64 seam. The layer MUST feed `composeBodySlabMvp` the slab's `Float64Array`
 * `view.slab.vp`, NOT the f32-narrowed `view.vp`. `composeBodySlabMvp` and `bodySlabCamLocal` are
 * mocked to recognisable values (their math has its own tests); `bodyRelativePose` stays UNMOCKED,
 * so `ctx.cam` fixtures need non-degenerate `position`/`target`.
 */

import { describe, it, expect, vi } from 'vitest';

import { earthPass } from '../../../../src/layers/body/passes/earthPass';
import { surfaceTilesPass } from '../../../../src/layers/body/passes/surfaceTilesPass';
import { FRAME_ORDER } from '../../../../src/services/engine/frame/frameOrder';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { seededBodyStates } from '../../../helpers/frame/seededBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { sunDirLocal } from '../../../../src/utils/camera/sunDirLocal';
import { imagePlaneBasis } from '../../../../src/utils/camera/imagePlaneBasis';
import { frameUp } from '../../../../src/utils/camera/frameUp';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { mat3FromColumns } from '../../../../src/utils/math/mat3FromColumns';
import { bodyRelativePose } from '../../../../src/services/engine/camera/bodyRelativePose';
import { innerBoundRadiusM } from '../../../../src/utils/occlusion/innerBoundRadiusM';
import { RENDER_ORIGIN_MPC } from '../../../../src/data/renderOrigin';
import { EARTH_SURFACE_PARAMS } from '../../../../src/data/bodies/earthSurfaceParams';
import { CLOUD_SHELL_PARAMS } from '../../../../src/layers/body/present/cloudShellParams';
import { Source } from '../../../../src/data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../src/data/selectionEncoding';
import { BODY_PICK_MIN_RADIUS_PX } from '../../../../src/services/engine/helpers/minPickRadiusMpc';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { BodyRuntime } from '../../../../src/layers/body/@types/BodyRuntime';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { SeededBody } from '../../../helpers/frame/SeededBody';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { BodyPoseProvider } from '../../../../src/@types/engine/camera/BodyPoseProvider';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { SurfaceTileDrawArgs } from '../../../../src/layers/body/@types/SurfaceTileDrawArgs';

// Mocked so tests can assert which vp/pose they consumed by argument identity and hand the
// layer recognisable return values.
const MOCK_MVP = new Float64Array(16);
const MOCK_CAM_LOCAL: Vec3 = [0.1, 0.2, 0.3];
vi.mock('../../../../src/utils/camera/composeBodySlabMvp', () => ({
  composeBodySlabMvp: vi.fn<() => Float64Array>(() => MOCK_MVP),
}));
vi.mock('../../../../src/utils/camera/bodySlabCamLocal', () => ({
  bodySlabCamLocal: vi.fn<() => Vec3>(() => MOCK_CAM_LOCAL),
}));
import { composeBodySlabMvp } from '../../../../src/utils/camera/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../../src/utils/camera/bodySlabCamLocal';
import { prepareBodySurfaceFrame } from '../../../../src/layers/body/present/prepareBodySurfaceFrame';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import { createFramePlannerResultStore } from '../../../../src/services/engine/frame/createFramePlannerResultStore';

// Stub the snapshot to the fixtures below, reusing each one's own positionMpc/orientation refs so
// toBe(...) holds. Mars is seeded too, for the second-bodyId memo test.
vi.mock('../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn(() => seededBodyStates(0, [SEEDED_EARTH, SEEDED_MARS])),
}));

function toBodyState(b: SeededBody): BodyState {
  return { positionMpc: b.positionMpc, orientation: b.orientation };
}

const EARTH_STATE = deriveBodyStates(CONST_J2000).get(asSceneBodyId('earth'))!;
const SEEDED_EARTH: SeededBody = {
  ...SCENE_EARTH,
  positionMpc: EARTH_STATE.positionMpc,
  orientation: EARTH_STATE.orientation,
};
const MARS_STATE = deriveBodyStates(CONST_J2000).get(asSceneBodyId('mars'))!;
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
 * A real `BodyPoseProvider` built like `frameContext.ts` (camBasisWorld via imagePlaneBasis/frameUp
 * at roll 0, then `bodyRelativePose` per body). Resolves earth and mars unconditionally; the bodies
 * seeded through the mocked `sceneBodyStates` gate which one a call succeeds for.
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
    return bodyRelativePose({ camPosMpc, camBasisWorld, bodyState });
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

/**
 * A ctx whose camera sits 1e-13 Mpc from Earth's centre along +x, looking AT Earth (the unmocked
 * `bodyRelativePose` needs a real position/target).
 */
function makeCtx(): FrameView {
  const drawCamPos: Vec3 = [
    SEEDED_EARTH.positionMpc[0] + 1e-13,
    SEEDED_EARTH.positionMpc[1],
    SEEDED_EARTH.positionMpc[2],
  ];
  return {
    snapshot: { meshBodies: [], sceneBodies: [] },
    cam: { position: drawCamPos, target: SEEDED_EARTH.positionMpc },
    drawCamPos,
    bodyPose: makeBodyPose(drawCamPos, SEEDED_EARTH.positionMpc),
    canvasSize: { width: 1280, height: 720 },
    drawPxPerRad: 720 / (2 * Math.tan((60 * Math.PI) / 180 / 2)),
  } as unknown as FrameView;
}

// Tests asserting `toHaveBeenCalledTimes(1)` call `makeCtx` fresh instead of sharing this:
// `prepareBodySurfaceFrame`'s ctx-keyed memo would otherwise hit an entry another test primed.
const NEAR_CTX = makeCtx();

/**
 * A body-m SlabView whose f64 `slab.vp` and f32 `vp` are deliberately DIFFERENT arrays (the f32 one
 * all-zero), so an identity check reveals which one the layer fed composeBodySlabMvp.
 */
function makeEarthBodyView(bodyId: 'earth' | 'mars' = 'earth'): SlabView {
  const f64Vp = Float64Array.from({ length: 16 }, (_, i) => i + 0.5);
  const f32Vp = new Float32Array(16);
  const slab: Slab = makeSlab({
    vp: f64Vp,
    frame: { kind: 'body-m', hostId: asSceneBodyId(bodyId) },
  });
  return {
    slab,
    vp: f32Vp,
    camPos: [0, 0, 5],
    viewportPx: [1280, 720],
    window: { originPx: [0, 0], sizePx: [1280, 720] },
  };
}

function makeRuntime(
  parts: { earthRenderer?: unknown; surfaceTileRenderer?: unknown; surfaceTiles?: unknown } = {},
): BodyRuntime {
  return {
    earthRenderer: parts.earthRenderer ?? {
      draw: vi.fn(),
      getMapView: vi.fn(() => ({}) as GPUTextureView),
    },
    surfaceTileRenderer: parts.surfaceTileRenderer ?? { draw: vi.fn() },
    surfaceTiles: parts.surfaceTiles ?? makeTiles({ cut: [], atlasView: null }),
  } as unknown as BodyRuntime;
}

function makeState(): EngineState {
  return {
    gpu: {},
    // Seeded from EARTH_SURFACE_PARAMS so the packed tail slots equal the authored defaults.
    settings: {
      earth: {
        ambientLight: EARTH_SURFACE_PARAMS.ambientLight,
        oceanRoughness: EARTH_SURFACE_PARAMS.oceanRoughness,
      },
      debug: { overlays: { 'surface-lod-overlay': false } },
    },
  } as unknown as EngineState;
}

const HEIGHT_ATLAS_VIEW = {} as GPUTextureView;

/** A runtime `surfaceTiles` stub with caller-controlled cut and atlas views: the
 * instanced-draw gate's three inputs (`getAtlasView()`, `getHeightAtlasView()`, `plan.cut`). */
function makeTiles(input: {
  readonly cut: readonly unknown[];
  readonly atlasView: GPUTextureView | null;
  /** Defaults to engaged: only the gate case below cares that it can be null. */
  readonly heightAtlasView?: GPUTextureView | null;
}): BodyRuntime['surfaceTiles'] {
  return {
    plan: { cut: input.cut },
    stream: {
      getAtlasView: () => input.atlasView,
      getHeightAtlasView: () =>
        input.heightAtlasView === undefined ? HEIGHT_ATLAS_VIEW : input.heightAtlasView,
    },
  } as unknown as BodyRuntime['surfaceTiles'];
}

const VIEW_STUB = makeEarthBodyView('earth');

describe('earthPass.enabled', () => {
  it('is false when the view is not Earth’s own body-m row', () => {
    const state = makeState();
    const worldMpcView = makeSlab({ frame: { kind: 'world-mpc', originRelative: true } });
    expect(
      earthPass(makeRuntime()).enabled(state, NEAR_CTX, {
        slab: worldMpcView,
        vp: new Float32Array(16),
        camPos: [0, 0, 0],
        viewportPx: [1, 1],
        window: { originPx: [0, 0], sizePx: [1, 1] },
      }),
    ).toBe(false);
    expect(earthPass(makeRuntime()).enabled(state, NEAR_CTX, makeEarthBodyView('mars'))).toBe(
      false,
    );
    expect(earthPass(makeRuntime()).enabled(state, NEAR_CTX, makeEarthBodyView('earth'))).toBe(
      true,
    );
  });
});

describe('prepareBodySurfaceFrame', () => {
  it('memoizes per (ctx, body): same object for a repeat call, a DIFFERENT object and pose for a second bodyId on the same ctx', () => {
    mvpMock.mockClear();
    const state: EngineState = {
      ...makeState(),
    } as unknown as EngineState;
    const ctx = makeCtx();
    const earthView = makeEarthBodyView('earth');
    const marsView = makeEarthBodyView('mars');

    const first = prepareBodySurfaceFrame(state, ctx, earthView);
    const second = prepareBodySurfaceFrame(state, ctx, earthView);
    expect(second).toBe(first);

    // A ctx-keyed-only memo would return Earth's frame for Mars: assert a different object AND
    // a different pose/body.
    const third = prepareBodySurfaceFrame(state, ctx, marsView);
    expect(third).not.toBe(first);
    expect(third!.body.id).toBe('mars');
    expect(third!.pose).not.toBe(first!.pose);
    expect(third!.bodyState.positionMpc).toBe(SEEDED_MARS.positionMpc);
  });
});

describe('earthPass.draw', () => {
  it('draws the seeded earth via composeBodySlabMvp with the slab f64 vp', () => {
    mvpMock.mockClear();
    camLocalMock.mockClear();
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const view = makeEarthBodyView('earth');
    const state = makeState();
    const globe = earthPass(makeRuntime({ earthRenderer: { draw: drawSpy } }));

    // Fresh ctx, not the shared NEAR_CTX: `toHaveBeenCalledTimes(1)` needs its own memo entry.
    // Well above the cloud-shadow descent-fade band.
    const ctx = makeCtx();
    globe.draw(PASS_STUB, view, ctx, state);

    expect(mvpMock).toHaveBeenCalledTimes(1);
    const call = mvpMock.mock.calls[0]!;
    // The load-bearing seam: first arg is the slab's Float64Array vp, NOT view.vp.
    expect(call[0]).toBe(view.slab.vp);
    expect(call[0]).not.toBe(view.vp);
    // The base globe composes at the inner bound in metres (F2-R5), never the
    // datum, so relief can never be occluded by it (§7.4).
    expect(call[2]).toBe(innerBoundRadiusM(SEEDED_EARTH.surface));

    expect(camLocalMock).toHaveBeenCalledTimes(1);
    expect(camLocalMock.mock.calls[0]![1]).toBe(innerBoundRadiusM(SEEDED_EARTH.surface));

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
    // earthPass must rotate the sun direction into Earth's local frame and pack it at f32 slots
    // 16..18 (bytes 64..75); pinned by recomputing sunDirLocal independently, NOT through the layer.
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const view = makeEarthBodyView('earth');
    const state = makeState();
    const globe = earthPass(makeRuntime({ earthRenderer: { draw: drawSpy } }));

    const ctx = makeCtx();
    globe.draw(PASS_STUB, view, ctx, state);

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
    // Ocean-glint camera in Earth's local frame (slots 20..22); roughnessBase 19, f0 23,
    // sunIrradiance 24, cloudShadowStrength 25, cloudShellRadius 26. Pinning scalars by named source
    // catches an argument-order swap at the pack call.
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const view = makeEarthBodyView('earth');
    const state = makeState();
    const globe = earthPass(makeRuntime({ earthRenderer: { draw: drawSpy } }));

    const ctx = makeCtx();
    globe.draw(PASS_STUB, view, ctx, state);

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
    // Slot 26 is the cloud shell radius the surface shadow ray intersects.
    expect(uniforms[26]).toBeCloseTo(CLOUD_SHELL_PARAMS.radiusRatio);
    // Slots 27..28 are the live settings overrides (night-side ambient floor, open-water GGX
    // roughness), seeded from EARTH_SURFACE_PARAMS; catches an ambientLight ↔ oceanRoughness swap.
    expect(uniforms[27]).toBeCloseTo(EARTH_SURFACE_PARAMS.ambientLight);
    expect(uniforms[28]).toBeCloseTo(EARTH_SURFACE_PARAMS.oceanRoughness);
  });

  it('scales cloudShadowStrength by the descent fade as the camera nears the surface', () => {
    // The three tests above sit far above the fade band, where the multiplier is 1, so a dropped
    // fade multiply would go unnoticed. This plants the camera INSIDE the band (edges from
    // CLOUD_SHELL_PARAMS): slot 25 must land strictly between 0 and the authored dial.
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const view = makeEarthBodyView('earth');
    const state = makeState();
    const globe = earthPass(makeRuntime({ earthRenderer: { draw: drawSpy } }));
    const radiusMpc = SEEDED_EARTH.surface.datumRadiusM * SCALE_UNITS.M_TO_MPC;
    const midAltitudeRadii =
      (CLOUD_SHELL_PARAMS.fadeStartAltitudeRadii + CLOUD_SHELL_PARAMS.fadeEndAltitudeRadii) / 2;
    const drawCamPos: Vec3 = [
      SEEDED_EARTH.positionMpc[0] + radiusMpc * (1 + midAltitudeRadii),
      SEEDED_EARTH.positionMpc[1],
      SEEDED_EARTH.positionMpc[2],
    ];
    const closeCtx = {
      snapshot: { meshBodies: [], sceneBodies: [] },
      cam: {
        position: drawCamPos,
        target: SEEDED_EARTH.positionMpc,
      },
      drawCamPos,
      bodyPose: makeBodyPose(drawCamPos, SEEDED_EARTH.positionMpc),
      canvasSize: { width: 1280, height: 720 },
    } as unknown as FrameView;

    globe.draw(PASS_STUB, view, closeCtx, state);

    const [, uniforms] = drawSpy.mock.calls[0]! as [GPURenderPassEncoder, Float32Array];
    expect(uniforms[25]).toBeGreaterThan(0);
    expect(uniforms[25]).toBeLessThan(EARTH_SURFACE_PARAMS.cloudShadowStrength);
  });
});

describe('surfaceTilesPass', () => {
  const STUB_CUT = [
    {
      id: { z: 8, x: 1, y: 1 },
      anchor: { lon0Rad: 0, lat0Rad: 0, dLonRad: 0.1, dLatRad: 0.1 },
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

  it('is ordered immediately after the base globe in every roster that draws it', () => {
    // The tile pipeline's depth compare needs the globe's depth already written: an ordering fact.
    const rosters = FRAME_ORDER.flatMap((step) =>
      step.kind === 'foreground'
        ? [step.bodyPasses]
        : step.kind === 'capture'
          ? [step.bodyPasses]
          : [],
    ).filter((roster) => roster.includes('surface-tiles'));
    expect(rosters.length).toBeGreaterThan(0);
    for (const roster of rosters) {
      expect(roster.indexOf('surface-tiles')).toBe(roster.indexOf('earth') + 1);
    }
  });

  it('forwards the eye-relative pose and the un-rebased view.vp to the tile renderer', () => {
    mvpMock.mockClear();
    const tileDraw = vi.fn<(pass: GPURenderPassEncoder, args: SurfaceTileDrawArgs) => void>();
    const view = makeEarthBodyView('earth');
    const state = makeState();
    const runtime = makeRuntime({
      surfaceTileRenderer: { draw: tileDraw },
      surfaceTiles: makeTiles({ cut: STUB_CUT, atlasView: ATLAS_VIEW }),
    });

    earthPass(runtime).draw(PASS_STUB, view, NEAR_CTX, state);
    surfaceTilesPass(runtime).draw(PASS_STUB, view, NEAR_CTX, state);

    expect(tileDraw).toHaveBeenCalledTimes(1);
    const [pass, args] = tileDraw.mock.calls[0]!;
    expect(pass).toBe(PASS_STUB);
    expect(args.tiles).toBe(STUB_CUT);
    expect(args.surfaceAtlasView).toBe(ATLAS_VIEW);
    expect(args.heightAtlasView).toBe(HEIGHT_ATLAS_VIEW);
    // No rebase: the tile vp is the slab's own eye-relative f32 `view.vp`.
    expect(args.vp).toBe(view.vp);
    expect(args.radiusM).toBe(SEEDED_EARTH.surface.datumRadiusM);
    expect(mvpMock.mock.calls[0]![1]).toBe(args.eyeRelBodyM);
  });

  it("packs the live debug.overlays['surface-lod-overlay'] toggle into the tile draw args", () => {
    // The debug toggle must reach the tile renderer every draw, not just on change.
    const tileDraw = vi.fn<(pass: GPURenderPassEncoder, args: SurfaceTileDrawArgs) => void>();
    const view = makeEarthBodyView('earth');
    const state = makeState();
    const runtime = makeRuntime({
      surfaceTileRenderer: { draw: tileDraw },
      surfaceTiles: makeTiles({ cut: STUB_CUT, atlasView: ATLAS_VIEW }),
    });

    surfaceTilesPass(runtime).draw(PASS_STUB, view, NEAR_CTX, state);
    expect(tileDraw.mock.calls[0]![1].debugLodOverlay).toBe(false);

    (state.settings as unknown as { debug: { overlays: Record<string, boolean> } }).debug.overlays[
      'surface-lod-overlay'
    ] = true;
    surfaceTilesPass(runtime).draw(PASS_STUB, view, NEAR_CTX, state);
    expect(tileDraw.mock.calls[1]![1].debugLodOverlay).toBe(true);
  });

  it('is disabled until the cut AND both atlases are live', () => {
    // Pre-residency the row simply does not run. The HEIGHT atlas is as load-bearing as albedo:
    // every vertex position reads it, so a cut drawn without it is undefined geometry.
    const view = makeEarthBodyView('earth');
    const enabledWith = (input: Parameters<typeof makeTiles>[0]) =>
      surfaceTilesPass(makeRuntime({ surfaceTiles: makeTiles(input) })).enabled(
        makeState(),
        NEAR_CTX,
        view,
      );

    const live = { cut: STUB_CUT, atlasView: ATLAS_VIEW };
    expect(enabledWith(live)).toBe(true);
    expect(enabledWith({ ...live, cut: [] })).toBe(false);
    expect(enabledWith({ ...live, atlasView: null })).toBe(false);
    expect(enabledWith({ ...live, heightAtlasView: null })).toBe(false);
  });

  it("a capture face draws surface tiles from the runtime's plan", () => {
    // Bug caught: a pass reading `snapshot.plans` throws on every probe face, whose
    // capture context carries a fresh, empty plans store.
    const tileDraw = vi.fn<(pass: GPURenderPassEncoder, args: SurfaceTileDrawArgs) => void>();
    const view = makeEarthBodyView('earth');
    const faceCtx = makeCtx();
    faceCtx.snapshot.plans = createFramePlannerResultStore();
    const runtime = makeRuntime({
      surfaceTileRenderer: { draw: tileDraw },
      surfaceTiles: makeTiles({ cut: STUB_CUT, atlasView: ATLAS_VIEW }),
    });
    const pass = surfaceTilesPass(runtime);

    expect(pass.enabled(makeState(), faceCtx, view)).toBe(true);
    pass.draw(PASS_STUB, view, faceCtx, makeState());
    expect(tileDraw.mock.calls[0]![1].tiles).toBe(STUB_CUT);
  });
});

describe('earthPass.draw — the base globe is always drawn', () => {
  const STUB_CUT = [
    {
      id: { z: 8, x: 1, y: 1 },
      anchor: { lon0Rad: 0, lat0Rad: 0, dLonRad: 0.1, dLatRad: 0.1 },
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

  /** ctx whose `drawCamPos` sits `altitudeKm` above Earth's surface along +x. */
  function makeAltitudeCtx(altitudeKm: number): FrameView {
    const radiusMpc = SEEDED_EARTH.surface.datumRadiusM * SCALE_UNITS.M_TO_MPC;
    const altitudeMpc = altitudeKm * SCALE_UNITS.KM_TO_MPC;
    const drawCamPos: Vec3 = [
      SEEDED_EARTH.positionMpc[0] + radiusMpc + altitudeMpc,
      SEEDED_EARTH.positionMpc[1],
      SEEDED_EARTH.positionMpc[2],
    ];
    return {
      snapshot: { meshBodies: [], sceneBodies: [] },
      cam: {
        position: drawCamPos,
        target: SEEDED_EARTH.positionMpc,
      },
      drawCamPos,
      bodyPose: makeBodyPose(drawCamPos, SEEDED_EARTH.positionMpc),
      canvasSize: { width: 1280, height: 720 },
    } as unknown as FrameView;
  }

  it('draws the base globe at low altitude under a full cut', () => {
    // The globe stays at the datum's inner bound (§7.4) and covers whatever the cut does not.
    const view = makeEarthBodyView('earth');
    const tileDraw = vi.fn();
    const state = makeState();
    const baseDraw = vi.fn();
    const runtime = makeRuntime({
      earthRenderer: { draw: baseDraw, getMapView: vi.fn(() => ({}) as GPUTextureView) },
      surfaceTileRenderer: { draw: tileDraw },
      surfaceTiles: makeTiles({ cut: STUB_CUT, atlasView: ATLAS_VIEW }),
    });

    const ctx = makeAltitudeCtx(1);
    earthPass(runtime).draw(PASS_STUB, view, ctx, state);
    surfaceTilesPass(runtime).draw(PASS_STUB, view, ctx, state);

    expect(baseDraw).toHaveBeenCalledTimes(1);
    expect(tileDraw).toHaveBeenCalledTimes(1);
  });
});

describe('earthPass.drawPick', () => {
  it('floors the pick radius and composes mvp/camLocal from the SAME floored radius', () => {
    mvpMock.mockClear();
    camLocalMock.mockClear();
    const drawSphere = vi.fn();
    const view = makeEarthBodyView('earth');
    // Far enough out that the BODY_PICK_MIN_RADIUS_PX floor exceeds Earth's
    // true radius — the far-edge-of-the-foreground-band case the floor exists
    // for (see minPickRadiusMpc's header).
    const ctx = makeCtx();
    const state = {
      ...makeState(),
      gpu: { bodyPickRenderer: { drawSphere } },
    } as unknown as EngineState;

    earthPass(makeRuntime()).drawPick!(PASS_STUB, view, ctx, state);

    expect(drawSphere).toHaveBeenCalledTimes(1);
    const [pass, args] = drawSphere.mock.calls[0]! as [
      GPURenderPassEncoder,
      { mvp: Float32Array; camPosLocal: Vec3; packedId: number },
    ];
    expect(pass).toBe(PASS_STUB);
    expect(args.packedId).toBe(packSelection(Source.Earth, 0 + PICK_SENTINEL_OFFSET));

    // The mvp and camLocal MUST share one floored radius (drawFlooredSpherePick's invariant).
    expect(mvpMock).toHaveBeenCalledTimes(1);
    expect(camLocalMock).toHaveBeenCalledTimes(1);
    const pickRadiusM = mvpMock.mock.calls[0]![2] as number;
    expect(camLocalMock.mock.calls[0]![1]).toBe(pickRadiusM);
    expect(pickRadiusM).toBeGreaterThan(SEEDED_EARTH.surface.datumRadiusM);

    const dM = Math.hypot(
      mvpMock.mock.calls[0]![1][0],
      mvpMock.mock.calls[0]![1][1],
      mvpMock.mock.calls[0]![1][2],
    );
    const expectedFloor = Math.max(
      SEEDED_EARTH.surface.datumRadiusM,
      (BODY_PICK_MIN_RADIUS_PX / ctx.drawPxPerRad) * dM,
    );
    expect(pickRadiusM).toBeCloseTo(expectedFloor, 6);
  });
});
