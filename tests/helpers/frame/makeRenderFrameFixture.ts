/**
 * makeRenderFrameFixture — the one mocked-GPU `RenderFrameInput` the renderFrame
 * suites share. Everything a legitimate change adds is DERIVED: settings from
 * `INITIAL_SETTINGS`, core GPU handles (all null) from `GPU_HANDLE_ROWS`, planner
 * stubs from the rig's own plan rows. Hand-wired here, once: three Layers' passes
 * (galaxy points and disks, cosmic-web density, the Milky-Way cloud) over mock
 * renderers, so a frame draws real content. `log` records the encoder lifecycle
 * and those renderers' draws in call order.
 */

import { vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';
import { CONTENT_PASSES } from '../../../src/services/engine/frame/passes';
import { createFramePlannerResultStore } from '../../../src/services/engine/frame/createFramePlannerResultStore';
import { GPU_HANDLE_ROWS } from '../../../src/services/engine/gpuHandles/gpuHandleRegistry';
import { gatePassByFade } from '../../../src/services/engine/layer/gatePassByFade';
import { ZERO_FOCUS } from '../../../src/services/engine/subsystems/recedingFocusSubsystem';
import { createDisabledGpuTimingService } from '../../../src/services/gpu/timing/gpuTimingService';
import { MILKY_WAY_FADE_FULL_PX } from '../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { APP_VISIBILITY_REGISTRY } from '../../../src/compositions/appVisibility';
import { VIEW_RIGS } from '../../../src/data/rendering/viewRigs';
import { MILKY_WAY_RADIUS_MPC } from '../../../src/data/milkyWay/milkyWayRadiusMpc';
import { galaxyPointSpritesPass } from '../../../src/layers/galaxyCatalog/pointSprites/passes/galaxyPointSpritesPass';
import { proceduralDisksPass } from '../../../src/layers/galaxyCatalog/disks/procedural/passes/proceduralDisksPass';
import { texturedDisksPass } from '../../../src/layers/galaxyCatalog/disks/textured/passes/texturedDisksPass';
import { cosmicWebDensityPass } from '../../../src/layers/cosmicWebDensity/densityCubes/passes/cosmicWebDensityPass';
import { cosmicWebDensityUpsamplePass } from '../../../src/layers/cosmicWebDensity/densityCubes/passes/cosmicWebDensityUpsamplePass';
import { cosmicWebDensityAccumulationPlanner } from '../../../src/layers/cosmicWebDensity/frame';
import { milkyWayAggregatePass } from '../../../src/layers/milkyWay/cloud/passes/milkyWayAggregatePass';
import { milkyWayUpsamplePass } from '../../../src/layers/milkyWay/cloud/passes/milkyWayUpsamplePass';
import { milkyWayPass } from '../../../src/layers/milkyWay/cloud/passes/milkyWayPass';
import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';
import { symmetricFrustum } from '../../../src/utils/camera/frustum/symmetricFrustum';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';
import { makeCosmoSlab } from '../../fixtures/makeCosmoSlab';
import { makeGalaxyCatalogItems } from '../../fixtures/makeGalaxyCatalogItems';
import { galaxyRowRuntime } from '../../support/layerPickCodes';
import { makeCubemapCaptureRuntimes } from '../engine/makeCubemapCaptureRuntimes';
import { stubPlannersFor } from './stubPlannersFor';
import type { RenderFrameFixtureOptions } from './RenderFrameFixtureOptions';
import type { OrbitCamera } from '../../../src/@types/camera/orbitCamera/OrbitCamera';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { RenderFrameInput } from '../../../src/@types/engine/frame/RenderFrameInput';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { CosmicWebDensityRuntime } from '../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime';
import type { GalaxyCatalogRuntime } from '../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import type { MilkyWayRuntime } from '../../../src/layers/milkyWay/@types/MilkyWayRuntime';

const FOV_Y_RAD = (60 * Math.PI) / 180;
const CANVAS = { width: 1280, height: 720 };

// DERIVED from the Milky-Way fade knobs: here the disc's apparent diameter is twice
// MILKY_WAY_FADE_FULL_PX, so its fade alpha is 1 and a fade re-tune moves this
// distance instead of silently dropping the cloud's passes.
const MW_ALIVE_DIST_MPC =
  (2 * MILKY_WAY_RADIUS_MPC * (CANVAS.height / (2 * Math.tan(FOV_Y_RAD / 2)))) /
  (2 * MILKY_WAY_FADE_FULL_PX);

export function makeRenderFrameFixture(options: RenderFrameFixtureOptions = {}) {
  const log: string[] = [];
  const logged = (name: string) => vi.fn((..._args: unknown[]) => void log.push(name));

  const pass = {
    end: logged('pass.end'),
    setPipeline: vi.fn(),
    setVertexBuffer: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
    drawIndexed: vi.fn(),
  } as unknown as GPURenderPassEncoder;
  const beginRenderPass = vi.fn((_desc: GPURenderPassDescriptor) => {
    log.push('encoder.beginRenderPass');
    return pass;
  });
  const finish = vi.fn(() => {
    log.push('encoder.finish');
    return {} as GPUCommandBuffer;
  });
  const encoder = { beginRenderPass, finish } as unknown as GPUCommandEncoder;
  const createCommandEncoder = vi.fn(() => {
    log.push('device.createCommandEncoder');
    return encoder;
  });
  const submit = vi.fn((_buffers: readonly GPUCommandBuffer[]) => {
    log.push('device.queue.submit');
  });
  const device = { createCommandEncoder, queue: { submit } } as unknown as GPUDevice;
  const context = {
    getCurrentTexture: () => ({ createView: () => ({ __id: 'swap-view' }) }),
  } as unknown as GPUCanvasContext;

  // Clear values match production: hdr and swap opaque black, every other row a=0.
  const opaque = { r: 0, g: 0, b: 0, a: 1 };
  const clear = { r: 0, g: 0, b: 0, a: 0 };
  const specs = [
    { id: 'hdr', format: 'rgba16float', depth: null, scale: 1, clearValue: opaque },
    {
      id: 'cosmic-web-density',
      format: 'rgba16float',
      depth: null,
      scale: 3,
      clearValue: clear,
      retained: true,
    },
    { id: 'mw-aggregate', format: 'rgba16float', depth: null, scale: 2, clearValue: clear },
    { id: 'swap', format: 'bgra8unorm', depth: null, scale: 1, clearValue: opaque },
  ];
  const specOf = (id: string) => {
    const spec = specs.find((row) => row.id === id);
    if (!spec) throw new Error(`fixture renderTargets: no spec row for '${id}'`);
    return spec;
  };
  // Every offscreen row gets a view; `swap` is the context's own texture.
  const renderTargetViews: Record<string, GPUTextureView> = Object.fromEntries(
    specs
      .filter((row) => row.id !== 'swap')
      .map((row) => [row.id, { __id: `${row.id}-view` } as unknown as GPUTextureView]),
  );
  const renderTargets = {
    specs,
    specOf,
    sizeOf: (id: string) => ({
      width: Math.max(1, Math.floor(CANVAS.width / specOf(id).scale)),
      height: Math.max(1, Math.floor(CANVAS.height / specOf(id).scale)),
    }),
    viewOf: (id: string) => {
      const view = renderTargetViews[id];
      if (!view) throw new Error(`fixture renderTargets: no view for '${id}'`);
      return view;
    },
    // No row here clears depth, so every sampling step gets the far placeholder.
    farDepthView: () => ({ __id: 'far-depth-view' }) as unknown as GPUTextureView,
  };

  const galaxyPointRenderer = { draw: logged('galaxyPointRenderer.draw') };
  // Empty planner outputs: both disk passes report `enabled: false`.
  const galaxyRuntime = {
    ...galaxyRowRuntime({ catalogs: new Map() }),
    pointRenderer: galaxyPointRenderer,
    proceduralDisks: { lastOutput: { instances: [] } },
    texturedDisks: { lastOutput: { disks: [] } },
  } as unknown as GalaxyCatalogRuntime;
  // No active field: both density passes stay off until a test revives the
  // renderer IN PLACE (the raymarch row captured it at construction).
  const densityRuntime = {
    renderer: { draw: vi.fn(), hasActiveFields: () => false },
    upsample: { draw: vi.fn(), destroy: vi.fn() },
    slots: {},
  } as unknown as CosmicWebDensityRuntime;
  const densityPlanner = cosmicWebDensityAccumulationPlanner(densityRuntime);
  const milkyWayCloudRenderer = {
    drawStars: logged('milkyWayCloudRenderer.drawStars'),
    drawDust: logged('milkyWayCloudRenderer.drawDust'),
  };
  // `additiveUpsample: null`, not absent: the pass guards on `=== null`.
  const milkyWayRuntime = {
    cloud: { buffers: () => ({ starBuf: {}, starCount: 0, dustBuf: null, dustCount: 0 }) },
    cloudRenderer: milkyWayCloudRenderer,
    additiveUpsample: null,
  } as unknown as MilkyWayRuntime;
  const compositor = { label: 'compositor', draw: logged('compositor.draw'), destroy: vi.fn() };

  const settings = {
    ...INITIAL_SETTINGS,
    galaxyCatalogs: { ...INITIAL_SETTINGS.galaxyCatalogs, items: makeGalaxyCatalogItems() },
    // Non-zero knobs, so "reaches the shader" and "zeroed" are distinguishable.
    hdr: { enabled: true, knee: 4, headroom: 0.25 },
    // Bloom only shapes the step list when on; no suite here asserts on it.
    bloom: { ...INITIAL_SETTINGS.bloom, enabled: false },
    // Both Layers switched on: whether each draws is its renderer's liveness alone.
    milkyWay: { ...INITIAL_SETTINGS.milkyWay, enabled: true, renderer: 'v1' as const },
    cosmicWebDensity: { ...INITIAL_SETTINGS.cosmicWebDensity, enabled: true },
    debug: { ...INITIAL_SETTINGS.debug, disabledPasses: {}, renderStrategy: 'auto' as const },
    ...options.settings,
  };

  const cam = {
    target: [0, 0, 0],
    distance: MW_ALIVE_DIST_MPC,
    yaw: 0,
    pitch: 0,
    fovYRad: FOV_Y_RAD,
    aspect: CANVAS.width / CANVAS.height,
    near: 0.001,
    far: 10000,
    position: new Float32Array([0, 0, MW_ALIVE_DIST_MPC]),
  } as unknown as OrbitCamera;
  const vp = new Float32Array(16) as unknown as Mat4;
  // `slabViewOf` indexes `slabs[COSMO]` directly, so a real row sits there.
  const cosmoSlab = makeCosmoSlab({ vp: Float64Array.from(vp as unknown as Float32Array) });
  const frustum = symmetricFrustum(FOV_Y_RAD, CANVAS.width / CANVAS.height);
  // The SAME set as `input.renderedTargets`: `executeFrame` unions into it and the
  // overlay passes read it back off the snapshot.
  const renderedTargets = new Set<string>();
  const canvas = {
    id: 'canvas',
    snapshot: {
      isReady: true,
      camBasisWorld: [...IDENTITY_MAT3] as Mat3,
      bodyStates: new Map(),
      bodyPose: () => null,
      slabBodyCandidates: [],
      meshBodies: [],
      sceneBodies: [],
      plans: createFramePlannerResultStore(),
      nowMs: 0,
      simDays: 0,
      altitudeMpc: 0,
      focusBlend: 0,
      focusPickId: null,
      focus: ZERO_FOCUS,
      renderTargets,
      renderedTargets,
      skyCapturesInBand: new Set(),
    },
    viewSlot: 0,
    viewKind: 'frame',
    bodyPose: () => null,
    cam,
    vp,
    slabs: [cosmoSlab, cosmoSlab],
    canvasSize: CANVAS,
    drawCamPos: [...cam.position],
    frustum,
    drawPxPerRad: CANVAS.height / (frustum.tanUp - frustum.tanDown),
  } as unknown as FrameView;

  // What `createLayers` gates each pass with; every fade resolves to 1.
  const fades = { opacityOf: () => 1, isAnyAnimating: () => false };
  const clipPlayer = { clipOpacityOf: () => 1 };
  const gateState = {
    subsystems: { fades, clipPlayer },
    visibilityEntries: APP_VISIBILITY_REGISTRY,
  } as unknown as EngineState;

  const state = {
    viewRig: 'mono',
    frameIndex: 0,
    tier: 'medium',
    perViewPlanMemory: new Map(),
    // Every core handle null (its pass reports `enabled: false`), then the two a
    // frame cannot run without.
    gpu: {
      ...Object.fromEntries(GPU_HANDLE_ROWS.map((row) => [row.key, null])),
      compositor,
      focusUniform: { bindGroup: {}, write: () => {}, destroy: () => {} },
    },
    settings,
    selection: { hover: null, select: null, focus: null },
    picking: { pickInFlight: false },
    subsystems: { fades, clipPlayer },
    // The fixture camera sits Mpc from every capture's anchor: nothing is scheduled.
    cubemapCaptures: makeCubemapCaptureRuntimes(),
    passes: [
      ...CONTENT_PASSES,
      galaxyPointSpritesPass(galaxyRuntime),
      proceduralDisksPass(galaxyRuntime),
      texturedDisksPass(galaxyRuntime),
      cosmicWebDensityPass(densityRuntime, densityPlanner),
      cosmicWebDensityUpsamplePass(densityRuntime),
      milkyWayAggregatePass(milkyWayRuntime),
      milkyWayUpsamplePass(milkyWayRuntime),
      milkyWayPass(milkyWayRuntime),
    ].map((contentPass) => gatePassByFade(contentPass, gateState)),
    computes: [],
    // The density passes read their planner's value, so it plans for real.
    planners: VIEW_RIGS.mono.program
      .flatMap(stubPlannersFor)
      .map((stub) => (stub.name === densityPlanner.name ? densityPlanner : stub)),
  } as unknown as EngineState;

  const input: RenderFrameInput = {
    canvas,
    views: [canvas],
    state,
    device,
    context,
    timingService: options.timingService ?? createDisabledGpuTimingService(),
    renderedTargets,
  };

  return {
    input,
    log,
    encoder,
    pass,
    beginRenderPass,
    finish,
    submit,
    createCommandEncoder,
    renderTargets,
    renderTargetViews,
    compositor,
    galaxyPointRenderer,
    milkyWayCloudRenderer,
    densityRuntime,
    cam,
    vp,
    canvasSize: CANVAS,
  };
}
