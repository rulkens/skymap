/**
 * renderFrame — the per-frame command-encoder dispatcher: encoder lifecycle and
 * ordering, the HDR attachment coming from the render-target table, and the
 * hdr→swap composite running after `pass.end`. The device, encoder, pass and every
 * renderer are mocked, so nothing here needs a real WebGPU context.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source } from '../../../../src/data/source';
import { packSelection } from '../../../../src/data/selectionEncoding';
import { BiasMode } from '../../../../src/data/galaxyCatalog/biasMode';
import { ToneMapCurve } from '../../../../src/data/toneMapCurve';
import { renderFrame } from '../../../../src/services/engine/frame/renderFrame';
import { createFramePlannerResultStore } from '../../../../src/services/engine/frame/createFramePlannerResultStore';
import { deriveView } from '../../../../src/services/engine/frame/deriveView';
import { faceViewSpec } from '../../../../src/utils/camera/faceViewSpec';
import { IDENTITY_MAT3 } from '../../../../src/utils/math/identityMat3';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import { expandFrameOrder } from '../../../../src/services/engine/frame/expandFrameOrder';
import { FRAME_ORDER } from '../../../../src/services/engine/frame/frameOrder';
import { VIEW_RIGS } from '../../../../src/data/rendering/viewRigs';
import { PRELUDE } from '../../../../src/data/rendering/frameSections';
import { stubPlannersFor } from '../../../helpers/frame/stubPlannersFor';
import { foregroundChainOrder } from '../../../../src/services/engine/frame/slabs';
import { bodyRowSlabs } from '../../../../src/services/engine/frame/bodyRowSlabs';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import type { FrameContentPlanner } from '../../../../src/@types/engine/frame/FrameContentPlanner';
import { galaxyPointSpritesPass } from '../../../../src/layers/galaxyCatalog/passes/galaxyPointSpritesPass';
import { proceduralDisksPass } from '../../../../src/layers/galaxyCatalog/passes/proceduralDisksPass';
import { texturedDisksPass } from '../../../../src/layers/galaxyCatalog/passes/texturedDisksPass';
import { cosmicWebDensityPass } from '../../../../src/layers/cosmicWebDensity/passes/cosmicWebDensityPass';
import { cosmicWebDensityUpsamplePass } from '../../../../src/layers/cosmicWebDensity/passes/cosmicWebDensityUpsamplePass';
import { milkyWayAggregatePass } from '../../../../src/layers/milkyWay/passes/milkyWayAggregatePass';
import { milkyWayUpsamplePass } from '../../../../src/layers/milkyWay/passes/milkyWayUpsamplePass';
import { milkyWayPass } from '../../../../src/layers/milkyWay/passes/milkyWayPass';
import { gatePassByFade } from '../../../../src/services/engine/layer/gatePassByFade';
import { APP_VISIBILITY } from '../../../../src/compositions/appVisibility';
import type { CosmicWebDensityRuntime } from '../../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime';
import type { GalaxyCatalogRuntime } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import type { MilkyWayRuntime } from '../../../../src/layers/milkyWay/@types/MilkyWayRuntime';
import { createDisabledGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import { INITIAL_SETTINGS } from '../../../../src/state/settings/initialSettings';
import { makeCosmoSlab } from '../../../fixtures/makeCosmoSlab';
import { makeGalaxyCatalogItems } from '../../../fixtures/makeGalaxyCatalogItems';
import { makeSlab } from '../../../fixtures/makeSlab';
import { makeCubemapCaptureRuntimes } from '../../../helpers/engine/makeCubemapCaptureRuntimes';
import { MILKY_WAY_FADE_FULL_PX } from '../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { MILKY_WAY_RADIUS_MPC } from '../../../../src/data/milkyWay/milkyWayRadiusMpc';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import { symmetricFrustum } from '../../../../src/utils/camera/symmetricFrustum';
import type { Mat4 } from 'wgpu-matrix';
import type { SelectionRef } from '../../../../src/@types/engine/SelectionRef';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';

type CallLog = string[];

function makeFakeRenderPass(callLog: CallLog) {
  return {
    end: vi.fn(() => {
      callLog.push('pass.end');
    }),
    setPipeline: vi.fn(),
    setVertexBuffer: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

function makeFakeCommandBuffer() {
  return {} as GPUCommandBuffer;
}

function makeEncoderEnv(callLog: CallLog) {
  const pass = makeFakeRenderPass(callLog);
  const finishedBuffer = makeFakeCommandBuffer();
  const beginRenderPass = vi.fn((desc: GPURenderPassDescriptor) => {
    callLog.push('encoder.beginRenderPass');
    (beginRenderPass as any).lastDescriptor = desc;
    return pass;
  });
  const finish = vi.fn(() => {
    callLog.push('encoder.finish');
    return finishedBuffer;
  });
  const encoder = { beginRenderPass, finish } as unknown as GPUCommandEncoder;
  return { encoder, pass, beginRenderPass, finish, finishedBuffer };
}

function makeFakeDevice(callLog: CallLog, encoder: GPUCommandEncoder) {
  const submit = vi.fn((buffers: ReadonlyArray<GPUCommandBuffer>) => {
    callLog.push('device.queue.submit');
    (submit as any).lastBuffers = buffers;
  });
  const createCommandEncoder = vi.fn(() => {
    callLog.push('device.createCommandEncoder');
    return encoder;
  });
  return {
    createCommandEncoder,
    queue: { submit },
  } as unknown as GPUDevice;
}

function makeFakeSwapView(): GPUTextureView {
  return { __id: 'swap-view' } as unknown as GPUTextureView;
}

function makeFakeContext(swapView: GPUTextureView, callLog: CallLog) {
  return {
    getCurrentTexture: vi.fn(() => ({
      createView: vi.fn(() => {
        callLog.push('context.getCurrentTexture.createView');
        return swapView;
      }),
    })),
  } as unknown as GPUCanvasContext;
}

function makeFakeHdrView(): GPUTextureView {
  return { __id: 'hdr-view' } as unknown as GPUTextureView;
}

const FAR_DEPTH_VIEW = { __id: 'far-depth-view' } as unknown as GPUTextureView;

function makeMockRenderTargets(views: Record<string, GPUTextureView>) {
  // Clear values match production (`renderTargets.ts`'s `renderTargetRows`): hdr
  // and swap opaque black (a=1), every other row a=0. `specOf` is what
  // `executeFrame`'s colorAttachment/depthAttachment/composite-dstFormat read.
  const specs = [
    {
      id: 'hdr',
      format: 'rgba16float',
      depth: null,
      scale: 1,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
    },
    {
      id: 'cosmic-web-density',
      format: 'rgba16float',
      depth: null,
      scale: 3,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
    },
    // milkyWayAggregatePass.draw reads this row's `scale` to size the
    // downscaled viewport it hands the star pass (the sprite clamp is in
    // TARGET pixels), so the row has to be here, not just a view.
    {
      id: 'mw-aggregate',
      format: 'rgba16float',
      depth: null,
      scale: 2,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
    },
    {
      id: 'swap',
      format: 'bgra8unorm',
      depth: null,
      scale: 1,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
    },
  ];
  return {
    specs,
    specOf: (id: string) => {
      const spec = specs.find((s) => s.id === id);
      if (!spec) throw new Error(`mock renderTargets: no spec row for '${id}'`);
      return spec;
    },
    // the density raymarch / milkyWayAggregatePass read this for their
    // downscaled viewport; the fixture canvas is the fixed 1280x720 the
    // `ctx` built below uses (`canvasWidth`/`FIXTURE_CANVAS_HEIGHT_PX`).
    sizeOf: (id: string) => {
      const spec = specs.find((s) => s.id === id);
      if (!spec || id === 'swap') throw new Error(`mock renderTargets: no size for '${id}'`);
      return {
        width: Math.max(1, Math.floor(1280 / spec.scale)),
        height: Math.max(1, Math.floor(FIXTURE_CANVAS_HEIGHT_PX / spec.scale)),
      };
    },
    viewOf: (id: string) => {
      const view = views[id];
      if (!view) throw new Error(`mock renderTargets: no view for '${id}'`);
      return view;
    },
    // What a `{ sample }` step reads: no row in this fixture clears depth, so
    // every sampling step gets the far-cleared placeholder — `depthViewOf`
    // is unreachable here and deliberately absent.
    farDepthView: () => FAR_DEPTH_VIEW,
    destroy: vi.fn(),
  } as any;
}

function makeMockCompositor(callLog: CallLog) {
  return {
    label: 'compositor',
    draw: vi.fn(() => {
      callLog.push('compositor.draw');
    }),
    destroy: vi.fn(),
  } as any;
}

function makeMockGalaxyPointRenderer(callLog: CallLog) {
  return {
    draw: vi.fn(() => {
      callLog.push('galaxyPointRenderer.draw');
    }),
  } as any;
}

/**
 * The cloud renderer has TWO entry points because its two passes render into
 * two different targets: `drawStars` into the reduced-resolution `mw-aggregate`
 * offscreen, `drawDust` full-res into HDR. Each logs separately so the frame
 * traces below can pin which pass each landed in.
 */
function makeMockMilkyWayCloudRenderer(callLog: CallLog) {
  return {
    drawStars: vi.fn(() => {
      callLog.push('milkyWayCloudRenderer.drawStars');
    }),
    drawDust: vi.fn(() => {
      callLog.push('milkyWayCloudRenderer.drawDust');
    }),
    destroy: vi.fn(),
  } as any;
}

function makeMockMilkyWayCloud() {
  return {
    buffers: () => ({
      starBuf: {} as GPUBuffer,
      starCount: 0,
      dustBuf: null,
      dustCount: 0,
    }),
    regenerate: vi.fn(),
    destroy: vi.fn(),
  } as any;
}

function makeMockThumbnails(callLog: CallLog) {
  return {
    runFrame: vi.fn(() => {
      callLog.push('thumbnails.runFrame');
    }),
    bindToRenderers: vi.fn(),
    hasInFlightFetches: vi.fn(() => false),
    destroy: vi.fn(),
    __testGetState: vi.fn(),
  } as any;
}

function makeMockTexturedQuadRenderer() {
  return { bindAtlas: vi.fn(), draw: vi.fn() } as any;
}

function makeMockTexturedDiskRenderer() {
  return { bindAtlas: vi.fn(), draw: vi.fn() } as any;
}

function makeMockProceduralDiskRenderer() {
  return { draw: vi.fn() } as any;
}

const FIXTURE_FOV_Y_RAD = (60 * Math.PI) / 180;
const FIXTURE_CANVAS_HEIGHT_PX = 720;

// Camera distance DERIVED from the Milky-Way fade knobs: the disc's apparent diameter is
// twice MILKY_WAY_FADE_FULL_PX under the fixture optics, so milkyWayFadeAlpha is 1 by
// construction and a fade re-tune moves this distance instead of silently disabling the pass.
const MW_ALIVE_DIST_MPC =
  (2 * MILKY_WAY_RADIUS_MPC * (FIXTURE_CANVAS_HEIGHT_PX / (2 * Math.tan(FIXTURE_FOV_Y_RAD / 2)))) /
  (2 * MILKY_WAY_FADE_FULL_PX);

function makeCam(): OrbitCamera {
  return {
    target: [0, 0, 0] as unknown as Float32Array,
    distance: MW_ALIVE_DIST_MPC,
    yaw: 0,
    pitch: 0,
    fovYRad: FIXTURE_FOV_Y_RAD,
    aspect: 16 / 9,
    near: 0.001,
    far: 10000,
    position: new Float32Array([0, 0, MW_ALIVE_DIST_MPC]),
  } as unknown as OrbitCamera;
}

// SCENE's `plan` row names 'structure-markers' by string, not by object
// identity (`FramePlannerResultStore` keys on `planner.name`) — a stub with an empty result is
// enough to satisfy `runPlanSteps`'s "every plan row names a registered
// planner" check without dragging in `produceStructureMarkers`'s own state.
// What `createLayers` gates each pass with: every fade resolves to 1 here.
const PASS_GATE_STATE = {
  subsystems: { fades: { opacityOf: () => 1 }, clipPlayer: { clipOpacityOf: () => 1 } },
  visibilityEntries: APP_VISIBILITY,
} as unknown as Parameters<typeof gatePassByFade>[1];

const STUB_PLANNERS: readonly FrameContentPlanner<unknown>[] = [
  {
    name: 'structure-markers',
    scope: 'perView',
    plan: () => ({ value: [], awake: false, settling: false }),
  },
  ...stubPlannersFor(PRELUDE),
];

function makeInput(
  overrides: { settings?: Partial<any>; disabledPasses?: Record<string, boolean> } = {},
) {
  const callLog: CallLog = [];
  const env = makeEncoderEnv(callLog);
  const device = makeFakeDevice(callLog, env.encoder);
  const swapView = makeFakeSwapView();
  const context = makeFakeContext(swapView, callLog);
  const hdrTargetView = makeFakeHdrView();
  const galaxyPointRenderer = makeMockGalaxyPointRenderer(callLog);
  // The galaxy passes close over their Layer's runtime. Empty planner outputs make both disk
  // passes report `enabled: false`, keeping the fixtures on point + milky-way ordering.
  const galaxyRuntime = {
    pointRenderer: galaxyPointRenderer,
    proceduralDisks: { lastOutput: { instances: [] } },
    texturedDisks: { lastOutput: { disks: [] } },
  } as unknown as GalaxyCatalogRuntime;
  // No active field ⇒ the density passes' shared liveness is null, keeping
  // these fixtures off the density raymarch; the ordering test swaps in a live
  // renderer and the gate test an upsample spy.
  const densityRuntime = {
    renderer: { draw: vi.fn(), hasActiveFields: () => false },
    upsample: { draw: vi.fn(), destroy: vi.fn() },
  } as unknown as CosmicWebDensityRuntime;
  const milkyWayCloudRenderer = makeMockMilkyWayCloudRenderer(callLog);
  const milkyWayCloud = makeMockMilkyWayCloud();
  // The milkyWay Layer's passes close over their own runtime, mirroring
  // galaxyRuntime/densityRuntime above. `aggregateUpsample: null` keeps these
  // fixtures free of an upsample blit they don't assert on (the layer's guard
  // is `=== null`, which `undefined` would slip past).
  const milkyWayRuntime = {
    cloud: milkyWayCloud,
    cloudRenderer: milkyWayCloudRenderer,
    aggregateUpsample: null,
  } as unknown as MilkyWayRuntime;
  const compositor = makeMockCompositor(callLog);
  // The render-target table backing views. The density row's default view is inert; the
  // density-ordering test swaps in its own half-res view via this record. The mw-aggregate row
  // IS touched every frame: the fixture camera keeps the Milky-Way cloud alive.
  const renderTargetViews: Record<string, GPUTextureView> = {
    hdr: hdrTargetView,
    'cosmic-web-density': {} as GPUTextureView,
    'mw-aggregate': { __id: 'mw-aggregate-view' } as unknown as GPUTextureView,
  };
  const renderTargets = makeMockRenderTargets(renderTargetViews);
  const thumbnails = makeMockThumbnails(callLog);
  const texturedQuadRenderer = makeMockTexturedQuadRenderer();
  const texturedDiskRenderer = makeMockTexturedDiskRenderer();
  const proceduralDiskRenderer = makeMockProceduralDiskRenderer();
  const cam = makeCam();

  const settings = {
    pointSizePx: 2.5,
    brightness: 1.0,
    selected: null as SelectionRef | null,
    provenance: {
      orientation: { highlight: true, filter: 'all' },
      size: { highlight: false, filter: 'all' },
    },
    biasMode: BiasMode.None,
    absMagLimit: -19,
    depthFadeEnabled: true,
    pxFadeStartPoints: 8,
    pxFadeEndPoints: 14,
    focus: { center: [0, 0, 0], apparentRadiusMpc: 0, physicalRadiusMpc: 0, blend: 0 } as const,
    exposure: 1.0,
    toneMapCurve: ToneMapCurve.Reinhard,
    hdrEnabled: true,
    hdrKnee: 4.0,
    hdrHeadroom: 0.25,
    galaxyTexturesEnabled: true,
    milkyWayEnabled: true,
    filamentsEnabled: false,
    filamentIntensity: 1,
    cosmicWebDensityEnabled: false,
    bloomEnabled: false,
    ...(overrides.settings ?? {}),
  };

  const canvasWidth = 1280;
  const canvasHeight = FIXTURE_CANVAS_HEIGHT_PX;
  const frustum = symmetricFrustum(FIXTURE_FOV_Y_RAD, canvasWidth / canvasHeight);
  const viewProj = new Float32Array(16) as unknown as Mat4;
  // The HDR encoders resolve one SlabView (COSMO) before the layer loop
  // via `slabViewOf(ctx, COSMO)`, which indexes `ctx.slabs[COSMO]`
  // directly — this fixture needs a real row there.
  const cosmoSlab: Slab = makeCosmoSlab({
    vp: Float64Array.from(viewProj as unknown as Float32Array),
  });
  // Shared by identity with `input.renderedTargets` below — the same object
  // `executeFrame` unions into and the five overlay passes read back off
  // `ctx.snapshot.renderedTargets`.
  const renderedTargets = new Set<string>();
  const snapshotFields = {
    isReady: true as const,
    cam,
    arm: null as unknown as never,
    camBasisWorld: [...IDENTITY_MAT3] as Mat3,
    bodyStates: new Map(),
    bodyPose: () => null,
    slabBodyCandidates: [] as never[],
    meshBodies: [] as never[],
    sceneBodies: [] as never[],
    plans: createFramePlannerResultStore(),
    cursorTexPx: null,
    nowMs: 0,
    simDays: 0,
    altitudeMpc: 0,
    focusBlend: 0,
    focusPickId: null,
    focus: {
      center: [0, 0, 0] as Readonly<[number, number, number]>,
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0,
      blend: 0,
    },
    renderTargets,
    renderedTargets,
  };
  const ctx = {
    id: 'canvas',
    snapshot: snapshotFields,
    viewSlot: 0,
    viewKind: 'frame' as const,
    bodyPose: () => null,
    cam,
    vp: viewProj,
    slabs: [cosmoSlab, cosmoSlab],
    canvasSize: { width: canvasWidth, height: canvasHeight },
    drawCamPos: [cam.position[0]!, cam.position[1]!, cam.position[2]!] as Readonly<
      [number, number, number]
    >,
    frustum,
    drawPxPerRad: canvasHeight / (frustum.tanUp - frustum.tanDown),
  };

  return {
    callLog,
    env,
    device,
    context,
    swapView,
    hdrTargetView,
    renderTargetViews,
    renderTargets,
    compositor,
    galaxyPointRenderer,
    densityRuntime,
    milkyWayCloudRenderer,
    milkyWayCloud,
    thumbnails,
    texturedQuadRenderer,
    texturedDiskRenderer,
    proceduralDiskRenderer,
    cam,
    canvasWidth,
    canvasHeight,
    viewProj,
    settings,
    input: {
      canvas: ctx,
      views: [ctx],
      state: {
        viewRig: 'mono',
        gpu: {
          labelRendererCosmo: null,
          label3DRenderer: null,
          markerLineRendererCosmo: null,
          debugLineRenderer: null,
          selectionRingRenderer: null,
          // Near-field handles null: the body layers and labelsNearPass report enabled=false, so the
          // (hdr, NEAR0) and foreground:0 renders select nothing and the foreground:0→swap composite is
          // touched-set-skipped; the fixtures stay a pure cosmological-frame trace.
          // No mesh renderer → the probe scheduler idles before reading `data`.
          meshBodyRenderer: null,
          // Near-field handle null: atmosphereShellPass disabled and the atmosphereSkyView compute step early-outs.
          orbitTrailRenderer: null,
          labelRendererNear: null,
          // Every `ContentPass.draw` reads its renderer off `state.gpu.*`; the milkyWay Layer's passes
          // close over `milkyWayRuntime` instead.
          galaxyPointRenderer,
          texturedDiskRenderer,
          proceduralDiskRenderer,
          compositor,
          focusUniform: { bindGroup: {}, write: () => {}, destroy: () => {} },
        },
        settings: {
          galaxyCatalogs: {
            items: makeGalaxyCatalogItems(),
            sizePx: settings.pointSizePx,
            brightness: settings.brightness,
            provenance: settings.provenance,
            depthFade: settings.depthFadeEnabled,
          },
          tonemap: {
            exposure: settings.exposure,
            curve: settings.toneMapCurve,
          },
          hdr: {
            enabled: settings.hdrEnabled,
            knee: settings.hdrKnee,
            headroom: settings.hdrHeadroom,
          },
          // Bloom off by default in these fixtures: the bloom render steps only
          // shape the program when enabled, and no fixture asserts on them.
          bloom: { enabled: settings.bloomEnabled, strength: 1, threshold: 1 },
          bias: { mode: settings.biasMode, absMagLimit: settings.absMagLimit },
          thumbnails: { enabled: settings.galaxyTexturesEnabled },
          milkyWay: { enabled: settings.milkyWayEnabled },
          cosmicWebFilaments: {
            enabled: settings.filamentsEnabled,
            intensity: settings.filamentIntensity,
          },
          constellations: { enabled: false, intensity: 1 },
          cosmicWebDensity: {
            ...INITIAL_SETTINGS.cosmicWebDensity,
            enabled: settings.cosmicWebDensityEnabled,
          },
          debug: { disabledPasses: overrides.disabledPasses ?? {}, renderStrategy: 'auto' },
        },
        selection: { select: settings.selected },
        picking: {
          pickInFlight: false,
        },
        subsystems: {
          proceduralDisks: null,
          texturedDisks: null,
          fades: { opacityOf: () => 1, isAnyAnimating: () => false },
          clipPlayer: { clipOpacityOf: () => 1 },
        },
        // The cubemap-capture bake bookkeeping — the two `last*` fields update
        // every frame; `bakedSettings` only changes while the row's band is
        // active. The fixture camera sits Mpc-scale away from Sgr A*, so the
        // band stays closed and nothing is scheduled; see
        // `scheduleCubemapCaptures`.
        cubemapCaptures: makeCubemapCaptureRuntimes(),
        passes: [
          ...CONTENT_PASSES,
          galaxyPointSpritesPass(galaxyRuntime),
          proceduralDisksPass(galaxyRuntime),
          texturedDisksPass(galaxyRuntime),
          cosmicWebDensityPass(densityRuntime),
          cosmicWebDensityUpsamplePass(densityRuntime),
          milkyWayAggregatePass(milkyWayRuntime),
          milkyWayUpsamplePass(milkyWayRuntime),
          milkyWayPass(milkyWayRuntime),
        ].map((pass) => gatePassByFade(pass, PASS_GATE_STATE)),
        computes: [],
        planners: STUB_PLANNERS,
      } as never,
      device,
      context,
      // Disabled stub (`service.enabled === false`) → renderFrame takes
      // the single-pass branch. Active-mode behaviour lives in
      // `renderFrame.timing.test.ts`.
      timingService: createDisabledGpuTimingService(),
      renderedTargets,
    },
  };
}

describe('renderFrame', () => {
  let fx: ReturnType<typeof makeInput>;

  beforeEach(() => {
    fx = makeInput();
  });

  it('creates exactly one command encoder on a frame with no capture faces', () => {
    // Mono's rig hands every section the same view (`ctx` itself), so
    // PRELUDE/SCENE/POST/OVERLAYS all accumulate into the one running batch —
    // one encoder for the whole frame.
    renderFrame(fx.input);
    expect(fx.device.createCommandEncoder).toHaveBeenCalledTimes(1);
  });

  it('submits exactly once, with the encoder.finish() output, on a frame with no capture faces', () => {
    renderFrame(fx.input);
    const submit = fx.device.queue.submit as any as ReturnType<typeof vi.fn>;
    expect(submit).toHaveBeenCalledTimes(1);
    expect(fx.env.finish).toHaveBeenCalledTimes(1);
    const submitted = (submit as any).lastBuffers as ReadonlyArray<GPUCommandBuffer>;
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toBe((fx.env.finish.mock.results[0] as any).value);
  });

  it("begins the HDR render pass with the target table's hdr view as the colour attachment", () => {
    // No-timing 'merged' strategy opens four passes: (hdr, COSMO) clear (the one pinned here), the
    // (mw-aggregate, NEAR0) cloud star pass, the (hdr, NEAR0) dust pass, and the hdr→swap composite.
    renderFrame(fx.input);
    const calls = (fx.env.beginRenderPass as any).mock.calls as Array<[GPURenderPassDescriptor]>;
    expect(calls).toHaveLength(4);

    const desc = calls[0]![0];
    const attachments = Array.from(desc.colorAttachments as any);
    expect(attachments).toHaveLength(1);
    const att = attachments[0] as any;
    expect(att.view).toBe(fx.hdrTargetView);
    expect(att.loadOp).toBe('clear');
    expect(att.storeOp).toBe('store');
    expect(att.clearValue).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it('forwards every settings field to galaxyPointRenderer.draw in the canonical order', () => {
    renderFrame(fx.input);
    const draw = fx.galaxyPointRenderer.draw as ReturnType<typeof vi.fn>;
    expect(draw).toHaveBeenCalledTimes(1);
    const args = draw.mock.calls[0]!;
    expect(args[0]).toBe(fx.env.pass);
    // args[1] is the resolved SlabView's `vp` — a fresh Float32Array
    // narrowed from the cosmological slab's Float64Array row by
    // `slabViewOf` (see `slabs.ts`), not the identical `fx.viewProj`
    // reference the ctx fixture was built from. Value equality is the
    // right check post-unification.
    expect(args[1]).toEqual(fx.viewProj);
    expect(args[2]).toEqual([fx.canvasWidth, fx.canvasHeight]);
    const drawSettings = args[3] as Record<string, unknown>;
    expect(drawSettings.pointSizePx).toBe(fx.settings.pointSizePx);
    expect(drawSettings.brightness).toBe(fx.settings.brightness);
    expect(drawSettings.selectedPacked).toBe(0xffffffff >>> 0);
    expect(Array.from(drawSettings.camPosWorld as ArrayLike<number>)).toEqual(
      Array.from(fx.cam.position),
    );
    // pxPerRad = h / (2 · tan(fovY/2))
    const expectedPxPerRad = fx.canvasHeight / (2 * Math.tan(fx.cam.fovYRad / 2));
    expect(drawSettings.pxPerRad as number).toBeCloseTo(expectedPxPerRad, 6);
    expect(drawSettings.provenance).toEqual(fx.settings.provenance);
    expect(drawSettings.biasMode).toBe(fx.settings.biasMode);
    expect(drawSettings.absMagLimit).toBe(fx.settings.absMagLimit);
    expect(drawSettings.depthFadeEnabled).toBe(fx.settings.depthFadeEnabled);
  });

  it('packs (source, index) into the selectedPacked u32 sent to galaxyPointRenderer.draw', () => {
    // Expected value comes from the shared packSelection, not a re-inlined
    // shift — see src/data/selectionEncoding.ts for the encoding.
    const fx2 = makeInput({
      settings: {
        selected: {
          type: 'galaxyCatalog',
          source: Source.SDSS,
          index: 42,
        } as SelectionRef,
      },
    });
    renderFrame(fx2.input);
    const draw = fx2.galaxyPointRenderer.draw as ReturnType<typeof vi.fn>;
    const expected = packSelection(Source.SDSS, 42);
    const drawSettings = draw.mock.calls[0]![3] as Record<string, unknown>;
    expect(drawSettings.selectedPacked).toBe(expected);
  });

  it("runs the hdr→swap composite after the HDR pass with blend 'replace' and the settings tone", () => {
    renderFrame(fx.input);
    const log = fx.callLog;
    const idxEnd = log.indexOf('pass.end');
    const idxComposite = log.indexOf('compositor.draw');
    expect(idxEnd).toBeGreaterThanOrEqual(0);
    expect(idxComposite).toBeGreaterThan(idxEnd);

    const draw = fx.compositor.draw as ReturnType<typeof vi.fn>;
    expect(draw).toHaveBeenCalledTimes(1);
    const args = draw.mock.calls[0]!;
    expect(args[1]).toBe(fx.hdrTargetView);
    expect(args[2]).toBe('replace');
    expect(args[3]).toEqual({
      exposure: fx.settings.exposure,
      curve: fx.settings.toneMapCurve,
      hdrKnee: 0,
      hdrHeadroom: 0,
    });
  });

  it('forwards the settings headroom knobs only when the swap chain is extended-range', () => {
    // The two knobs are live settings but must reach the shader as 0 on an SDR
    // swap chain, where spilled energy would just be clamped back to white. The
    // gate lives in renderFrame via `hdrActiveOf`, which reads the `swap` row's
    // format straight off `renderTargets.specs` — flipping it to the extended-range
    // format is the whole difference between the settings values and zeros.
    // Non-null assertion: the mock's `specs` always seeds a 'swap' row (see
    // `makeMockRenderTargets`) — if that ever stops being true this should
    // fail loudly here, not as an opaque "set properties of undefined" below.
    const swapSpec = fx.renderTargets.specs.find((spec: { id: string }) => spec.id === 'swap')!;
    swapSpec.format = 'rgba16float';
    renderFrame(fx.input);

    const draw = fx.compositor.draw as ReturnType<typeof vi.fn>;
    const tone = draw.mock.calls[0]![3];
    expect(tone.hdrKnee).toBe(fx.settings.hdrKnee);
    expect(tone.hdrHeadroom).toBe(fx.settings.hdrHeadroom);
  });

  it('the tone-map gets zero headroom when the HDR toggle is off even on a float swap chain', () => {
    // A float swap chain alone isn't sufficient: the format switch and the
    // `hdr.enabled` write land in separate frames, so a frame can carry an
    // extended-range swap chain with the viewer's toggle still off. Gating
    // on `hdrActive` alone would leak the settings knobs into that frame.
    const fx2 = makeInput({ settings: { hdrEnabled: false } });
    const swapSpec = fx2.renderTargets.specs.find((spec: { id: string }) => spec.id === 'swap')!;
    swapSpec.format = 'rgba16float';
    renderFrame(fx2.input);

    const draw = fx2.compositor.draw as ReturnType<typeof vi.fn>;
    const tone = draw.mock.calls[0]![3];
    expect(tone.hdrKnee).toBe(0);
    expect(tone.hdrHeadroom).toBe(0);
  });

  it('records the full frame in canonical order: createEncoder → hdr COSMO pass (points) → mw-aggregate pass (cloud stars) → hdr NEAR0 pass (cloud dust) → composite pass → compositor.draw → finish → submit', () => {
    // No-timing 'merged' path: the four passes of the first test (the cloud's dust draws in the
    // cloud's own slab since the fixed COSMO near plane clipped its disc mid-descent), then finish + submit.
    renderFrame(fx.input);
    const interesting = [
      'device.createCommandEncoder',
      'encoder.beginRenderPass',
      'galaxyPointRenderer.draw',
      'milkyWayCloudRenderer.drawStars',
      'milkyWayCloudRenderer.drawDust',
      'pass.end',
      'compositor.draw',
      'encoder.finish',
      'device.queue.submit',
    ];
    const filtered = fx.callLog.filter((e) => interesting.includes(e));
    expect(filtered).toEqual([
      'device.createCommandEncoder',
      'encoder.beginRenderPass',
      'galaxyPointRenderer.draw',
      'pass.end',
      'encoder.beginRenderPass',
      'milkyWayCloudRenderer.drawStars',
      'pass.end',
      'encoder.beginRenderPass',
      'milkyWayCloudRenderer.drawDust',
      'pass.end',
      'encoder.beginRenderPass',
      'compositor.draw',
      'pass.end',
      'encoder.finish',
      'device.queue.submit',
    ]);
  });

  it('encodes no foreground pass or composite while the foreground handles are null', () => {
    // With the body/star renderers and labelRendererNear null, the near-field steps select only the
    // cloud's dust + upsample rows and foreground:0 is never touched, so its →swap composite is
    // skipped: exactly four passes (hdr COSMO, mw-aggregate, hdr NEAR0, hdr→swap), one compositor draw.
    renderFrame(fx.input);
    const calls = (fx.env.beginRenderPass as any).mock.calls as Array<[GPURenderPassDescriptor]>;
    expect(calls).toHaveLength(4);
    for (const [desc] of calls) {
      expect((desc as any).label).not.toContain('foreground:0');
    }
    expect(fx.compositor.draw).toHaveBeenCalledTimes(1);
    expect((fx.compositor.draw as ReturnType<typeof vi.fn>).mock.calls[0]![2]).toBe('replace');
  });

  it('opens the density pass before the hdr pass when the density layer is live', () => {
    // The density render step precedes the hdr step, so with non-null density liveness the density
    // pass is the FIRST beginRenderPass.
    const fx2 = makeInput({ settings: { cosmicWebDensityEnabled: true } });
    const drawSpy = vi.fn();
    // Mutated in place: the raymarch row captured this renderer at construction.
    Object.assign(fx2.densityRuntime.renderer, { draw: drawSpy, hasActiveFields: () => true });
    // A null upsample handle draws nothing; this test pins the density pass
    // ordering. Its enabled() still tracks the SAME liveness (no desync).
    const reducedResView = { __id: 'reduced-res' } as unknown as GPUTextureView;
    fx2.renderTargetViews['cosmic-web-density'] = reducedResView;

    renderFrame(fx2.input);

    const calls = (fx2.env.beginRenderPass as any).mock.calls as Array<[GPURenderPassDescriptor]>;
    expect(calls.length).toBeGreaterThanOrEqual(4); // density + hdr + mw-aggregate + composite
    const firstAtt = Array.from(calls[0]![0].colorAttachments as any)[0] as any;
    expect(firstAtt.view).toBe(reducedResView);
    expect(firstAtt.loadOp).toBe('clear');
    expect(firstAtt.clearValue).toEqual({ r: 0, g: 0, b: 0, a: 0 });

    expect(drawSpy).toHaveBeenCalledTimes(1);
  });

  it('skips the density pass and hides its upsample when no field is live', () => {
    // Default fixture: no active field → liveness null → BOTH the density
    // producer and the upsample consumer gate off the same fact, so they
    // cannot disagree. Wire an upsample spy to prove the consumer is also
    // hidden. Only the hdr + composite passes open.
    const upsampleDraw = vi.fn();
    (fx.densityRuntime as any).upsample = { draw: upsampleDraw, destroy: vi.fn() };
    renderFrame(fx.input);
    const calls = (fx.env.beginRenderPass as any).mock.calls as Array<[GPURenderPassDescriptor]>;
    expect(calls).toHaveLength(4);
    expect(upsampleDraw).not.toHaveBeenCalled();
  });

  it('skips a pass whose name appears in settings.debug.disabledPasses', () => {
    // The DebugPanel flips entries in/out of `settings.debug.disabledPasses`.
    // The executor's render-step group filter checks the record after each
    // layer's own `enabled()` gate, so mapping `point-sprites` to true stops
    // `galaxyPointRenderer.draw` even though every other input would run it.
    const fx2 = makeInput({ disabledPasses: { 'point-sprites': true } });
    renderFrame(fx2.input);
    expect(fx2.galaxyPointRenderer.draw).not.toHaveBeenCalled();
    // Milky-way still draws — the override is per-pass, not global — and both
    // halves of the cloud (its own aggregate pass, its dust pass in HDR) run.
    expect(fx2.milkyWayCloudRenderer.drawStars).toHaveBeenCalledTimes(1);
    expect(fx2.milkyWayCloudRenderer.drawDust).toHaveBeenCalledTimes(1);
  });

  it('does not skip a pass whose name maps to false in disabledPasses', () => {
    // `[name] === false` means enabled — only `=== true` hides a pass.
    const fx2 = makeInput({ disabledPasses: { 'point-sprites': false } });
    renderFrame(fx2.input);
    expect(fx2.galaxyPointRenderer.draw).toHaveBeenCalledTimes(1);
  });

  it('mono rig submits the same step list as FRAME_ORDER', () => {
    // The rig split must expand to exactly the same steps whether walked as
    // one flat list or as four sections concatenated — and VIEW_RIGS.mono IS
    // those four sections, against the main ctx alone.
    const options = {
      tone: { exposure: 1, curve: ToneMapCurve.Reinhard, hdrKnee: 0, hdrHeadroom: 0 },
      bloomEnabled: false,
      foregroundChain: foregroundChainOrder(fx.input.canvas.slabs),
      captureFaces: new Map(),
      bodyRowSlabs: bodyRowSlabs(fx.input.canvas),
    };
    const passes = (fx.input.state as any).passes;
    const whole = expandFrameOrder(FRAME_ORDER, passes, options);
    const bySections = VIEW_RIGS.mono.program.flatMap((section) =>
      expandFrameOrder(section.steps, passes, options),
    );
    expect(bySections).toEqual(whole);
    // mono returns null, never its own spec — see `ViewRig.views`'s doc: a
    // spec would derive the canvas view a second time and split the submit.
    expect(VIEW_RIGS.mono.views(fx.input.canvas, fx.input.state as any)).toBeNull();
  });

  it('a registered rig returning two specs yields two views sharing the frame snapshot', () => {
    // The shared-snapshot invariant is structural: `ViewSpec`s carry no
    // snapshot of their own, so a rig's specs, derived exactly as `runFrame`
    // derives them (`rig.views(canvas, state)` → `deriveView` per spec), can
    // only ever produce views of THIS canvas's snapshot.
    (VIEW_RIGS as any).__snapshotIdentityTest = {
      views: () => [faceViewSpec('probe', 0, 64, 0), faceViewSpec('probe', 1, 64, 1)],
      program: [],
    };
    (fx.input.state as any).viewRig = '__snapshotIdentityTest';
    try {
      const specs = (VIEW_RIGS as any).__snapshotIdentityTest.views(
        fx.input.canvas,
        fx.input.state,
      );
      const views = specs.map((spec: any) => deriveView(fx.input.canvas.snapshot, fx.cam, spec));
      renderFrame({ ...fx.input, views } as any);
      expect(views[0].snapshot).toBe(fx.input.canvas.snapshot);
      expect(views[1].snapshot).toBe(fx.input.canvas.snapshot);
    } finally {
      delete (VIEW_RIGS as any).__snapshotIdentityTest;
    }
  });

  it('a perView section with two views submits twice, each expanded from its own view', () => {
    const stubPass = { name: 'stub-foreground', enabled: () => true, draw: vi.fn() };
    (fx.input.state as any).passes = [...(fx.input.state as any).passes, stubPass];

    // view1's chain is NEAR0 alone (one foreground step); view2 adds a
    // body-m row (a second, distinct-slab step) — the counts must track
    // each view's OWN slabs, not the main ctx's.
    const near0Slab = makeSlab();
    const bodySlab = makeSlab({ index: 2, frame: { kind: 'body-m', hostId: 'earth' as any } });
    const view1 = { ...fx.input.canvas, slabs: [near0Slab] };
    const view2 = { ...fx.input.canvas, slabs: [near0Slab, makeCosmoSlab(), bodySlab] };

    (VIEW_RIGS as any).__twoViewsTest = {
      views: () => [],
      program: [
        {
          scope: 'perView',
          steps: [
            {
              kind: 'foreground',
              target: 'hdr',
              near0Passes: ['stub-foreground'],
              bodyPasses: ['stub-foreground'],
            },
          ],
        },
      ],
    };
    (fx.input.state as any).viewRig = '__twoViewsTest';

    try {
      renderFrame({ ...fx.input, views: [view1, view2] } as any);
    } finally {
      delete (VIEW_RIGS as any).__twoViewsTest;
    }

    const submit = fx.device.queue.submit as any as ReturnType<typeof vi.fn>;
    expect(submit).toHaveBeenCalledTimes(2);
    const beginCalls = (fx.env.beginRenderPass as any).mock.calls as Array<
      [GPURenderPassDescriptor]
    >;
    expect(beginCalls.length).toBe(3);
  });

  it('a once section sees the frame-wide content fact across views, while each view still clears its own first touch (radar K4)', () => {
    // A `once` section against `canvas` sees what a DIFFERENT view's
    // `perView` section drew: the content question is frame-wide
    // (`ctx.snapshot.renderedTargets`), read here through a stub overlay
    // pass, while the executor's per-call `touched` set — which decides
    // clear-vs-load — stays private: view B's own first touch of `hdr`
    // still CLEARS, even though view A already drew into it moments
    // earlier in the same frame.
    const stubHdrPass = { name: 'stub-hdr', enabled: () => true, draw: vi.fn() };
    const seenContentFact: boolean[] = [];
    const overlayPass = {
      name: 'stub-overlay',
      enabled: () => true,
      draw: vi.fn((_pass: unknown, _view: unknown, ctx: FrameView) => {
        seenContentFact.push(ctx.snapshot.renderedTargets.has('hdr'));
      }),
    };
    (fx.input.state as any).passes = [...(fx.input.state as any).passes, stubHdrPass, overlayPass];

    // Neither view is `canvas` — the fact must be visible to canvas's `once`
    // section without being tied to `canvas === views[0]`.
    const viewA = { ...fx.input.canvas, viewSlot: 1, slabs: [makeSlab()] };
    const viewB = { ...fx.input.canvas, viewSlot: 2, slabs: [makeSlab()] };

    (VIEW_RIGS as any).__foldTest = {
      views: () => [],
      program: [
        {
          scope: 'perView',
          steps: [{ kind: 'render', target: 'hdr', slab: 0, passes: ['stub-hdr'] }],
        },
        {
          scope: 'once',
          steps: [{ kind: 'render', target: 'swap', slab: 0, passes: ['stub-overlay'] }],
        },
      ],
    };
    (fx.input.state as any).viewRig = '__foldTest';

    try {
      renderFrame({ ...fx.input, views: [viewA, viewB] } as any);
    } finally {
      delete (VIEW_RIGS as any).__foldTest;
    }

    expect(seenContentFact).toEqual([true]);

    const hdrCalls = (fx.env.beginRenderPass as any).mock.calls.filter(
      ([desc]: [any]) => desc.colorAttachments[0].view === fx.hdrTargetView,
    );
    expect(hdrCalls).toHaveLength(2);
    expect(hdrCalls[0]![0].colorAttachments[0].loadOp).toBe('clear');
    expect(hdrCalls[1]![0].colorAttachments[0].loadOp).toBe('clear');
  });
});
