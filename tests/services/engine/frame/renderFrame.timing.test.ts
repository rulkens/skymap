/**
 * renderFrame — the timing service is consulted per pass.
 *
 * The fixture gates every optional pass off through null subsystems / null
 * optional renderers, so the trace covers only point-sprites and the Milky-Way
 * cloud's three rows. The byte-identical claim for the service-null path lives as
 * a snapshot in `renderFrameSplitBaseline.test.ts`; this file pins the structural
 * no-call invariant instead.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';
import { BiasMode } from '../../../../src/data/galaxyCatalog/biasMode';
import { ToneMapCurve } from '../../../../src/data/toneMapCurve';
import { DEFAULT_GALAXY_PROVENANCE } from '../../../../src/layers/galaxyCatalog/state/defaults';
import { createDisabledGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import { renderFrame } from '../../../../src/services/engine/frame/renderFrame';
import { createFramePlannerResultStore } from '../../../../src/services/engine/frame/createFramePlannerResultStore';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import { cosmicWebDensityPass } from '../../../../src/layers/cosmicWebDensity/passes/cosmicWebDensityPass';
import { cosmicWebDensityUpsamplePass } from '../../../../src/layers/cosmicWebDensity/passes/cosmicWebDensityUpsamplePass';
import { milkyWayAggregatePass } from '../../../../src/layers/milkyWay/passes/milkyWayAggregatePass';
import { milkyWayUpsamplePass } from '../../../../src/layers/milkyWay/passes/milkyWayUpsamplePass';
import { milkyWayPass } from '../../../../src/layers/milkyWay/passes/milkyWayPass';
import { gatePassByFade } from '../../../../src/services/engine/layer/gatePassByFade';
import { APP_VISIBILITY } from '../../../../src/compositions/appVisibility';
import type { CosmicWebDensityRuntime } from '../../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime';
import type { MilkyWayRuntime } from '../../../../src/layers/milkyWay/@types/MilkyWayRuntime';
import { PRELUDE } from '../../../../src/data/rendering/frameSections';
import { stubPlannersFor } from '../../../helpers/frame/stubPlannersFor';
import type { FrameContentPlanner } from '../../../../src/@types/engine/frame/FrameContentPlanner';
import { galaxyPointSpritesPass } from '../../../../src/layers/galaxyCatalog/passes/galaxyPointSpritesPass';
import type { GalaxyCatalogRuntime } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import { makeCosmoSlab } from '../../../fixtures/makeCosmoSlab';
import { makeGalaxyCatalogItems } from '../../../fixtures/makeGalaxyCatalogItems';
import { makeCubemapCaptureRuntimes } from '../../../helpers/engine/makeCubemapCaptureRuntimes';
import { MILKY_WAY_FADE_FULL_PX } from '../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { MILKY_WAY_RADIUS_MPC } from '../../../../src/data/milkyWay/milkyWayRadiusMpc';
import type { RenderFrameInput } from '../../../../src/@types/engine/frame/RenderFrameInput';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { GpuTimingService } from '../../../../src/@types/gpu/timing/GpuTimingService';
import type { TimingSlotName } from '../../../../src/@types/gpu/timing/TimingSlotName';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import { INITIAL_SETTINGS } from '../../../../src/state/settings/initialSettings';

// `descriptorFor` returns a DISTINCT descriptor per slot, with the stub querySet tagged
// `{ _stub: slot }`, so assertions can tell which slot's descriptor landed on which pass.

function makeFakeTimingService() {
  const beginFrame = vi.fn(() => ({ frameIndex: 0, stagingSlot: 0 as const }));
  const descriptorFor = vi.fn((slot: TimingSlotName) => ({
    querySet: { _stub: slot } as unknown as GPUQuerySet,
    beginningOfPassWriteIndex: 100,
    endOfPassWriteIndex: 101,
  }));
  const endFrame = vi.fn();
  const subscribe = vi.fn(() => () => {});
  const destroy = vi.fn();
  const svc: GpuTimingService = {
    enabled: true,
    beginFrame,
    descriptorFor,
    endFrame,
    subscribe,
    destroy,
  };
  return { svc, beginFrame, descriptorFor, endFrame };
}

type Beg = { kind: 'beginRenderPass'; desc: GPURenderPassDescriptor };

function makeFakeRenderPass() {
  return {
    end: vi.fn(),
    setPipeline: vi.fn(),
    setVertexBuffer: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
    drawIndexed: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

function makeEncoderEnv() {
  const pass = makeFakeRenderPass();
  const beginCalls: Beg[] = [];
  const beginRenderPass = vi.fn((desc: GPURenderPassDescriptor) => {
    beginCalls.push({ kind: 'beginRenderPass', desc });
    return pass;
  });
  const finish = vi.fn(() => ({}) as GPUCommandBuffer);
  const encoder = { beginRenderPass, finish } as unknown as GPUCommandEncoder;
  return { encoder, pass, beginCalls };
}

function makeFakeDevice(encoder: GPUCommandEncoder) {
  return {
    createCommandEncoder: vi.fn(() => encoder),
    queue: { submit: vi.fn() },
  } as unknown as GPUDevice;
}

function makeFakeContext(): GPUCanvasContext {
  return {
    getCurrentTexture: vi.fn(() => ({
      createView: vi.fn(() => ({}) as GPUTextureView),
    })),
  } as unknown as GPUCanvasContext;
}

function makeLoggingRenderer() {
  return { draw: vi.fn(), render: vi.fn() };
}

function makeRenderTargets(views: Record<string, GPUTextureView>) {
  // Clear values match production; `specOf` is what `executeFrame` reads.
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
    // downscaled viewport it hands the star pass, so the row must exist here
    // and not only in the views record.
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
    // downscaled viewport; the fixture canvas is the fixed 1280x720
    // `makeMinimalInputWithTiming` builds `ctx` with.
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
    // What a `{ sample }` step reads: no row here clears depth, so every
    // sampling step gets the far-cleared placeholder — `depthViewOf` is
    // unreachable here and deliberately absent.
    farDepthView: () => ({ __id: 'far-depth-view' }) as unknown as GPUTextureView,
    destroy: vi.fn(),
  };
}

const FIXTURE_FOV_Y_RAD = (60 * Math.PI) / 180;
const FIXTURE_CANVAS_HEIGHT_PX = 720;

// Camera distance DERIVED from the Milky-Way fade knobs: at this distance
// the disc's apparent diameter is twice MILKY_WAY_FADE_FULL_PX under the
// fixture optics, so milkyWayFadeAlpha is 1 by construction and the
// milky-way pass registers its timing slot. A visual-gate re-tune of the
// fade band moves this distance instead of silently dropping the slot.
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
// identity — a stub with an empty result satisfies `runPlanSteps` without
// dragging in `produceStructureMarkers`'s own state (see renderFrame.test.ts).
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

function makeMinimalInputWithTiming(timingService: GpuTimingService): {
  input: RenderFrameInput;
  beginCalls: Beg[];
  encoder: GPUCommandEncoder;
  device: GPUDevice;
  renderTargetViews: Record<string, GPUTextureView>;
  densityRuntime: CosmicWebDensityRuntime;
} {
  const env = makeEncoderEnv();
  const device = makeFakeDevice(env.encoder);
  const context = makeFakeContext();
  const galaxyPointRenderer = makeLoggingRenderer();
  const milkyWayCloudRenderer = { drawStars: vi.fn(), drawDust: vi.fn() };
  const milkyWayRuntime = {
    cloud: { buffers: () => ({ starBuf: {}, starCount: 0, dustBuf: null, dustCount: 0 }) },
    cloudRenderer: milkyWayCloudRenderer,
    aggregateUpsample: null,
  } as unknown as MilkyWayRuntime;
  const horizonShellRenderer = makeLoggingRenderer();
  const proceduralDiskRenderer = makeLoggingRenderer();
  const texturedDiskRenderer = makeLoggingRenderer();
  const renderTargetViews: Record<string, GPUTextureView> = {
    hdr: { __id: 'hdr-view' } as unknown as GPUTextureView,
    'cosmic-web-density': { __id: 'density-view' } as unknown as GPUTextureView,
    'mw-aggregate': { __id: 'mw-aggregate-view' } as unknown as GPUTextureView,
  };
  const renderTargets = makeRenderTargets(renderTargetViews);
  // No active field ⇒ the density passes stay gated off unless a test revives
  // this renderer in place (the raymarch row captured it at construction).
  const densityRuntime = {
    renderer: { draw: vi.fn(), hasActiveFields: () => false },
    upsample: { draw: vi.fn(), destroy: vi.fn() },
  } as unknown as CosmicWebDensityRuntime;

  const cam = makeCam();
  const canvasWidth = 1280;
  const canvasHeight = FIXTURE_CANVAS_HEIGHT_PX;
  const viewProj = new Float32Array(16) as unknown as Mat4;
  // The HDR encoders resolve one SlabView (COSMO) before the layer loop
  // via `slabViewOf(ctx, COSMO)`, which indexes `ctx.slabs[COSMO]`
  // directly — this fixture needs a real row there.
  const cosmoSlab: Slab = makeCosmoSlab({
    vp: Float64Array.from(viewProj as unknown as Float32Array),
  });

  const renderedTargets = new Set<string>();
  const snapshotFields = {
    isReady: true as const,
    slabBodyCandidates: [],
    bodyStates: new Map(),
    nowMs: 0,
    // The handed value's recession factor lerps on this; production seeds it
    // to 0 in frameContext, and an absent one yields NaN alphas here.
    focusBlend: 0,
    renderTargets,
    renderedTargets,
    plans: createFramePlannerResultStore(),
  };
  const ctx = {
    id: 'canvas',
    snapshot: snapshotFields,
    cam,
    vp: viewProj,
    slabs: [cosmoSlab, cosmoSlab],
    canvasSize: { width: canvasWidth, height: canvasHeight },
    drawCamPos: [cam.position[0]!, cam.position[1]!, cam.position[2]!] as Readonly<
      [number, number, number]
    >,
    drawPxPerRad: canvasHeight / (2 * Math.tan(cam.fovYRad / 2)),
  } as never;

  const settings = {
    pointSizePx: 2.5,
    brightness: 1.0,
    selected: null as { source: SourceType; localIdx: number } | null,
    biasMode: BiasMode.None,
    absMagLimit: -19,
    depthFadeEnabled: true,
    pxFadeStartPoints: 8,
    pxFadeEndPoints: 14,
    exposure: 1.0,
    toneMapCurve: ToneMapCurve.Reinhard,
    galaxyTexturesEnabled: true,
    milkyWayEnabled: true,
    filamentsEnabled: false,
    filamentIntensity: 1,
    cosmicWebDensityEnabled: false,
  };

  const input: RenderFrameInput = {
    canvas: ctx,
    views: [ctx],
    state: {
      viewRig: 'mono',
      gpu: {
        labelRendererCosmo: null,
        markerLineRendererCosmo: null,
        debugLineRenderer: null,
        selectionRingRenderer: null,
        // Near-field handles null: the near-field steps select nothing and bill no timing slot; the only
        // near-field rows left are the Milky-Way cloud's three, whose handles ARE wired below.
        // No mesh renderer → the probe scheduler idles before reading `data`.
        meshBodyRenderer: null,
        orbitTrailRenderer: null,
        labelRendererNear: null,
        // Every `ContentPass.draw` reads its renderer off `state.gpu.*`; the milkyWay Layer's passes close
        // over `milkyWayRuntime` instead.
        horizonShellRenderer,
        compositor: { label: 'compositor', draw: vi.fn(), destroy: vi.fn() },
        focusUniform: { bindGroup: {}, write: () => {}, destroy: () => {} },
      },
      settings: {
        galaxyCatalogs: {
          items: makeGalaxyCatalogItems(),
          sizePx: settings.pointSizePx,
          brightness: settings.brightness,
          provenance: DEFAULT_GALAXY_PROVENANCE,
          depthFade: settings.depthFadeEnabled,
        },
        tonemap: { exposure: settings.exposure, curve: settings.toneMapCurve },
        // Bloom off: this fixture times the base (non-bloom) program shape.
        bloom: { enabled: false, strength: 1, threshold: 1 },
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
        debug: { disabledPasses: {}, renderStrategy: 'auto' },
      },
      selection: { select: settings.selected },
      picking: {
        pickInFlight: false,
      },
      subsystems: {
        proceduralDisks: null,
        texturedDisks: null,
        // filamentsPass.enabled consults the FadeRegistry to keep the layer
        // alive through fade-out tails; this fixture wants it GATED OFF, so
        // every other id fades to 0. The Milky-Way cloud is the exception: its
        // liveness projection MULTIPLIES this opacity into its alpha, so a
        // blanket 0 would disable the three cloud rows the test is about
        // (opacity 0 ⇒ no render). Production seeds that fade from
        // `settings.milkyWay.enabled`, which is true here, hence 1.
        fades: {
          opacityOf: (id: { kind: string }) => (id.kind === 'milkyWay' ? 1 : 0),
          isAnyAnimating: () => false,
        },
        clipPlayer: { clipOpacityOf: () => 1 },
      },
      cubemapCaptures: makeCubemapCaptureRuntimes(),
      passes: [
        ...CONTENT_PASSES,
        galaxyPointSpritesPass({
          pointRenderer: galaxyPointRenderer,
        } as unknown as GalaxyCatalogRuntime),
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
    timingService,
    renderedTargets,
  };

  return {
    input,
    beginCalls: env.beginCalls,
    encoder: env.encoder,
    device,
    renderTargetViews,
    densityRuntime,
  };
}

describe('renderFrame — timing service hookup', () => {
  it('calls beginFrame once, descriptorFor per enabled layer + composite, and endFrame with the encoder', () => {
    const { svc, beginFrame, descriptorFor, endFrame } = makeFakeTimingService();
    const { input, beginCalls, encoder } = makeMinimalInputWithTiming(svc);

    renderFrame(input);

    expect(beginFrame).toHaveBeenCalledTimes(1);

    // 'perLayerTimed' strategy: descriptorFor fires once per enabled layer plus once for the hdr→swap
    // composite. Enabled here: point-sprites and the cloud's three rows (milky-way-aggregate in its
    // reduced-res offscreen, milky-way-upsample and milky-way in HDR), which share one liveness gate;
    // MW_ALIVE_DIST_MPC is the close framing that lights the cloud.
    const slotsCalled = descriptorFor.mock.calls.map((c) => c[0]);
    expect(slotsCalled).toContain('point-sprites');
    expect(slotsCalled).toContain('milky-way-aggregate');
    expect(slotsCalled).toContain('milky-way-upsample');
    expect(slotsCalled).toContain('milky-way');
    expect(slotsCalled).toContain('hdr→swap');
    expect(slotsCalled).not.toContain('ui-overlay');
    expect(slotsCalled).not.toContain('tone-map');
    expect(descriptorFor).toHaveBeenCalledTimes(5);

    // Every opened pass carries its slot's timestampWrites (the first HDR pass carries the clear AND
    // its own descriptor), so all five begins are tagged; the composite's pass is opened by the
    // executor against the swap view.
    expect(beginCalls).toHaveLength(5);
    const stubSlots = beginCalls.map((b) => {
      const tw = (
        b.desc as GPURenderPassDescriptor & {
          timestampWrites?: GPURenderPassTimestampWrites;
        }
      ).timestampWrites;
      expect(tw).toBeDefined();
      return (tw!.querySet as unknown as { _stub: TimingSlotName })._stub;
    });
    // The cloud's aggregate row draws into its own offscreen between the COSMO
    // hdr layer and the two hdr NEAR0 rows it feeds; within the hdr NEAR0 step
    // the upsample precedes the dust so the dust extincts the cloud's own
    // starlight.
    expect(stubSlots).toEqual([
      'point-sprites',
      'milky-way-aggregate',
      'milky-way-upsample',
      'milky-way',
      'hdr→swap',
    ]);

    expect(endFrame).toHaveBeenCalledTimes(1);
    expect(endFrame.mock.calls[0]![1]).toBe(encoder);
  });

  it('skips all timing calls when timingService is disabled', () => {
    const { input, beginCalls, device } = makeMinimalInputWithTiming(
      createDisabledGpuTimingService(),
    );

    expect(() => renderFrame(input)).not.toThrow();

    expect(device.createCommandEncoder).toHaveBeenCalled();

    for (const b of beginCalls) {
      const desc = b.desc as GPURenderPassDescriptor & {
        timestampWrites?: GPURenderPassTimestampWrites;
      };
      expect(desc.timestampWrites).toBeUndefined();
    }
  });

  it('bills the density raymarch pass against its own slot when timings are active', () => {
    const { svc, descriptorFor } = makeFakeTimingService();
    const { input, beginCalls, renderTargetViews, densityRuntime } =
      makeMinimalInputWithTiming(svc);

    (input.state as any).settings.cosmicWebDensity = { enabled: true, items: {} };
    Object.assign(densityRuntime.renderer, { hasActiveFields: () => true });
    const reducedView = { __id: 'reduced' } as unknown as GPUTextureView;
    renderTargetViews['cosmic-web-density'] = reducedView;

    renderFrame(input);

    const slots = descriptorFor.mock.calls.map((c) => c[0]);
    expect(slots).toContain('cosmic-web-density');
    // The density render step precedes the hdr step, so the density pass is the FIRST
    // beginRenderPass (index 0).
    const preDesc = beginCalls[0]!.desc as GPURenderPassDescriptor & {
      timestampWrites?: GPURenderPassTimestampWrites;
    };
    expect(preDesc.timestampWrites).toBeDefined();
    const tag = (preDesc.timestampWrites!.querySet as unknown as { _stub: string })._stub;
    expect(tag).toBe('cosmic-web-density');
  });
});
