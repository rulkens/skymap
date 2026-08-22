/**
 * renderFrame — the per-frame command-encoder dispatcher: encoder lifecycle and
 * ordering, the HDR attachment coming from the render-target table, and the
 * hdr→swap composite running after `pass.end`. The device, encoder, pass and every
 * renderer are mocked, so nothing here needs a real WebGPU context.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source } from '../../../../src/data/sources';
import { packSelection } from '../../../../src/data/selectionEncoding';
import { BiasMode } from '../../../../src/data/galaxyCatalog/biasMode';
import { ToneMapCurve } from '../../../../src/data/toneMapCurve';
import { renderFrame } from '../../../../src/services/engine/frame/renderFrame';
import { createDisabledGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import { COSMO } from '../../../../src/services/engine/frame/slabs';
import {
  MILKY_WAY_FADE_FULL_PX,
  MILKY_WAY_RADIUS_MPC,
} from '../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { Mat4 } from 'wgpu-matrix';
import type { SelectionRef } from '../../../../src/@types/engine/SelectionRef';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';

// ── Test fixtures ───────────────────────────────────────────────────────────

/**
 * Tracks the chronological order of every interesting call so we can
 * assert ordering relationships (e.g. `galaxyPointRenderer.draw` came before
 * `pass.end`, which came before `compositor.draw`).  The encoder, the
 * pass, and every renderer hand the same array back through their
 * `vi.fn()` impls.
 */
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

/**
 * Build a fresh encoder + render-pass pair for one frame. The encoder
 * spies stash their last descriptor / finished buffer on themselves so
 * tests can assert post-call state without globals. Returned as a struct
 * so the fixture can also reach the inner `pass` and raw `vi.fn` refs.
 */
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

/**
 * Mock the offscreen render-target table. Executor + layers resolve views
 * via `viewOf(id)`; the backing `views` record is handed in by reference so
 * a test can swap a row's view (e.g. the volume half-res view) after fixture
 * construction.
 */
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
      id: 'volume',
      format: 'rgba16float',
      depth: null,
      scale: 3,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
    },
    // zoneOfAvoidanceLayer.draw reads this row's `scale` to size the
    // downscaled viewport it hands the band raymarch. The default fixture
    // keeps zoneOfAvoidanceRenderer null, so deriveZoneOfAvoidanceLiveness
    // gates the 'zoa' step off (mirrors volumeLiveness's renderer-null
    // gate) — the row still has to exist for the spec lookup, though.
    {
      id: 'zoa',
      format: 'rgba16float',
      depth: null,
      scale: 5,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
    },
    // milkyWayAggregateLayer.draw reads this row's `scale` to size the
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
    // scalarVolumeLayer / milkyWayAggregateLayer read this for their
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
    destroy: vi.fn(),
  } as any;
}

/**
 * Mock the unified Compositor. The FRAME program's `hdr→swap` step calls
 * `compositor.draw(pass, srcView, blend, tone)` to tone-map the HDR target onto
 * the swap chain.
 */
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

/**
 * Stub the generated-cloud handle the milky-way pass reads off
 * `state.gpu.milkyWayCloud`. `buffers()` returns an inert snapshot — the
 * renderer mock never touches its contents.
 */
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

function makeMockHorizonShellRenderer(callLog: CallLog) {
  return {
    draw: vi.fn(() => {
      callLog.push('horizonShellRenderer.draw');
    }),
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

// Fixture camera optics — the ctx built in makeInput() mirrors these.
const FIXTURE_FOV_Y_RAD = (60 * Math.PI) / 180;
const FIXTURE_CANVAS_HEIGHT_PX = 720;

// Camera distance DERIVED from the Milky-Way fade knobs: at this distance
// the disc's apparent diameter is twice MILKY_WAY_FADE_FULL_PX under the
// fixture optics, so milkyWayFadeAlpha is 1 by construction and the MW pass
// stays alive for the ordering tests. A visual-gate re-tune of the fade
// band moves this distance instead of silently disabling the pass under a
// magic-number camera.
const MW_ALIVE_DIST_MPC =
  (2 * MILKY_WAY_RADIUS_MPC * (FIXTURE_CANVAS_HEIGHT_PX / (2 * Math.tan(FIXTURE_FOV_Y_RAD / 2)))) /
  (2 * MILKY_WAY_FADE_FULL_PX);

function makeCam(): OrbitCamera {
  // Camera close enough that the Milky-Way disc sits safely above its FULL
  // apparent size (MW_ALIVE_DIST_MPC) — the fade gate must not suppress
  // the draw call in tests that assert MW ordering.
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

/** Build a complete RenderFrameInput fixture with sensible defaults. */
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
  const milkyWayCloudRenderer = makeMockMilkyWayCloudRenderer(callLog);
  const milkyWayCloud = makeMockMilkyWayCloud();
  const horizonShellRenderer = makeMockHorizonShellRenderer(callLog);
  const compositor = makeMockCompositor(callLog);
  // The render-target table backing views. The volume row's default view is
  // an inert stub — renderFrame's baseline tests don't exercise the volume
  // pass (volumesEnabled is false by default); the volume-ordering test
  // swaps in its own half-res view via this record. The mw-aggregate row DOES
  // get touched every frame here: the fixture camera keeps the Milky-Way cloud
  // alive, so its star pass opens a real pass against this view.
  const renderTargetViews: Record<string, GPUTextureView> = {
    hdr: hdrTargetView,
    volume: {} as GPUTextureView,
    zoa: { __id: 'zoa-view' } as unknown as GPUTextureView,
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
    visibleSourceMask: 0xffffffff,
    provenance: {
      orientation: { highlight: true, filter: 'all' },
      size: { highlight: false, filter: 'all' },
    },
    biasMode: BiasMode.None,
    absMagLimit: -19,
    depthFadeEnabled: true,
    // Points-pass crossfade-OUT band thresholds. Match the runtime
    // defaults from `thumbnailSubsystem.ts` so the fixture mirrors
    // production.
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
    volumesEnabled: false,
    bloomEnabled: false,
    ...(overrides.settings ?? {}),
  };

  // Per-frame derived snapshot under `input.ctx` (a `ReadyFrameContext`):
  // `runFrame` derives these once via `deriveFrameContext()` and forwards
  // a single struct. The test mirrors that wiring.
  const canvasWidth = 1280;
  const canvasHeight = FIXTURE_CANVAS_HEIGHT_PX;
  const viewProj = new Float32Array(16) as unknown as Mat4;
  // The HDR encoders resolve one SlabView (COSMO) before the layer loop
  // via `slabViewOf(ctx, COSMO)`, which indexes `ctx.slabs[COSMO]`
  // directly — this fixture needs a real row there.
  const cosmoSlab: Slab = {
    index: COSMO,
    nearMpc: 0.01,
    farMpc: 50000,
    vp: Float64Array.from(viewProj as unknown as Float32Array),
    originRelative: false,
    precision: 'f32',
    reversedZ: false,
  };
  const ctx = {
    isReady: true as const,
    renderedTargets: new Set<string>(),
    cam,
    vp: viewProj,
    slabs: [cosmoSlab, cosmoSlab],
    canvasSize: { width: canvasWidth, height: canvasHeight },
    drawCamPos: [cam.position[0]!, cam.position[1]!, cam.position[2]!] as Readonly<
      [number, number, number]
    >,
    drawPxPerRad: canvasHeight / (2 * Math.tan(cam.fovYRad / 2)),
    nowMs: 0,
    simDays: 0,
    fovYRad: FIXTURE_FOV_Y_RAD,
    focusBlend: 0,
    visibleSourceMask: 0xffffffff,
    focus: {
      center: [0, 0, 0] as Readonly<[number, number, number]>,
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0,
      blend: 0,
    },
    galaxyPointRenderer,
    renderTargets,
    texturedDisks: thumbnails,
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
    milkyWayCloudRenderer,
    milkyWayCloud,
    horizonShellRenderer,
    thumbnails,
    texturedQuadRenderer,
    texturedDiskRenderer,
    proceduralDiskRenderer,
    cam,
    // Mirror these on the fixture root so tests read them directly
    // instead of reaching into `input.ctx.*` for every assertion.
    canvasWidth,
    canvasHeight,
    viewProj,
    // Expose the local settings bag so tests can assert against it
    // (e.g. exposure, toneMapCurve) — RenderFrameInput carries no settings
    // field of its own.
    settings,
    input: {
      ctx,
      // ContentLayers read engine state via `input.state`. The label +
      // marker-line layers read `state.gpu.*` in their `enabled()` gates;
      // nulling those handles makes the layers skip (enabled → false), so
      // these tests stay focused on point + milky-way ordering.
      state: {
        // focusUniform: renderFrame writes it once per frame and
        // galaxyPointSpritesLayer binds its group; a no-op write + opaque bind
        // group keeps the mock encoder happy.
        gpu: {
          labelRenderer: null,
          markerLineRenderer: null,
          // clipPathDebugLayer.enabled short-circuits on a null renderer.
          debugLineRenderer: null,
          selectionRingRenderer: null,
          volumeFieldRenderer: null,
          flowFieldRenderer: null,
          structureMarkerRenderer: null,
          // Near-field handles null → the body layers, star-points,
          // star-catalog, and foregroundLabelsLayer all report enabled=false,
          // so the program's
          // (hdr, NEAR0) render and foreground:0 render select nothing and
          // the foreground:0→swap composite is touched-set-skipped. These
          // fixtures stay a pure cosmological-frame trace (see the
          // null-handle skip test below).
          earthRenderer: null,
          starRenderer: null,
          planetRenderer: null,
          // Near-field handle null → atmosphereShellLayer reports enabled=false
          // AND the atmosphereSkyView compute step early-outs, so these fixtures
          // stay a pure cosmological-frame trace (like the other body handles).
          atmosphereShellRenderer: null,
          starPointRenderer: null,
          orbitTrailRenderer: null,
          starCatalogRenderer: null,
          foregroundLabelRenderer: null,
          // milkyWayLayer.draw reads the generated cloud buffers off this handle.
          milkyWayCloud,
          // milkyWayUpsampleLayer shares the cloud's liveness gate, so it is
          // enabled here; a null handle makes its `draw` self-guard and issue
          // nothing, keeping these fixtures free of an upsample blit they
          // don't assert on. The key must EXIST — the layer's guard is
          // `=== null`, which `undefined` would slip past.
          milkyWayAggregateUpsample: null,
          // Every `ContentLayer.draw` reads its renderer straight off
          // `state.gpu.*` — this is the ONLY place these mock instances are
          // wired in (no top-level `input.*` duplication; see
          // `RenderFrameInput`'s slimmed shape).
          milkyWayCloudRenderer,
          horizonShellRenderer,
          texturedDiskRenderer,
          proceduralDiskRenderer,
          filamentRenderer: null,
          // zoneOfAvoidanceLayer.draw (the band) and zoneOfAvoidanceUpsampleLayer.draw
          // (the lettering) both read this off state.gpu.* directly, same === null
          // early-return guard as filamentRenderer above; the key must EXIST
          // (undefined would slip past `=== null`) — see the
          // milkyWayAggregateUpsample comment above for the same landmine.
          zoneOfAvoidanceRenderer: null,
          // zoneOfAvoidanceUpsampleLayer's offscreen blit shares the same
          // key-must-exist landmine as milkyWayAggregateUpsample above — the
          // fixture camera sits inside the band's visibility window, so this
          // layer's `enabled` is true and `draw` runs every frame here.
          zoneOfAvoidanceUpsample: null,
          // labels3dLayer.enabled reads this off state.gpu.* directly, same
          // === null early-return guard as zoneOfAvoidanceRenderer above —
          // the key must EXIST (undefined would slip past `=== null`).
          label3DRenderer: null,
          // The FRAME program's hdr→swap composite reads state.gpu.compositor.
          compositor,
          focusUniform: { bindGroup: {}, write: () => {}, destroy: () => {} },
        },
        // encodeFlowCompute (pre-HDR) reads these; flow is default-off so the
        // gate early-returns once the renderer is null.  A null slot →
        // slotReady false → not loaded.  The encoders read the DebugPanel
        // renderer-toggle override bag off `settings.debug.disabledPasses`:
        // most tests pass no overrides so the default is an empty record (matches
        // production); the skip-on-toggle test passes `overrides.disabledPasses`.
        settings: {
          galaxyCatalogs: {
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
          filaments: { enabled: settings.filamentsEnabled, intensity: settings.filamentIntensity },
          constellations: { enabled: false, intensity: 1 },
          volumes: { enabled: settings.volumesEnabled, items: {} },
          flow: { enabled: false },
          debug: { disabledPasses: overrides.disabledPasses ?? {}, renderStrategy: 'auto' },
        },
        selection: { select: settings.selected },
        assetSlots: { flow: null },
        // Pick-throttle bag; the content passes don't touch it, but the
        // engine-state shape carries it — fields sit at their default
        // 'nothing in flight' values.
        picking: {
          pickInFlight: false,
          pointerDown: false,
        },
        // proceduralDisksLayer / texturedDisksLayer each read their slot
        // off `state.subsystems` in their `enabled()` gate; nulling both
        // references makes the layers skip cleanly.
        subsystems: {
          proceduralDisks: null,
          texturedDisks: null,
          // filamentsLayer.enabled consults the FadeRegistry to keep the
          // layer alive through fade-out tails. A minimal opacityOf stub
          // keeps the gate from crashing.
          fades: { opacityOf: () => 1 },
          clipPlayer: { clipOpacityOf: () => 1 },
        },
      } as never,
      device,
      context,
      // Disabled stub (`service.enabled === false`) → renderFrame takes
      // the single-pass branch. Active-mode behaviour lives in
      // `renderFrame.timing.test.ts`.
      timingService: createDisabledGpuTimingService(),
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('renderFrame', () => {
  let fx: ReturnType<typeof makeInput>;

  beforeEach(() => {
    fx = makeInput();
  });

  it('creates exactly one command encoder per frame', () => {
    renderFrame(fx.input);
    expect(fx.device.createCommandEncoder).toHaveBeenCalledTimes(1);
  });

  it('submits exactly once with the encoder.finish() output', () => {
    renderFrame(fx.input);
    const submit = fx.device.queue.submit as any as ReturnType<typeof vi.fn>;
    expect(submit).toHaveBeenCalledTimes(1);
    expect(fx.env.finish).toHaveBeenCalledTimes(1);
    // The submitted buffer is the one finish() returned.
    const submitted = (submit as any).lastBuffers as ReadonlyArray<GPUCommandBuffer>;
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toBe((fx.env.finish.mock.results[0] as any).value);
  });

  it("begins the HDR render pass with the target table's hdr view as the colour attachment", () => {
    // No-timing path → 'merged' strategy: zoneOfAvoidanceRenderer is null in
    // this fixture, so deriveZoneOfAvoidanceLiveness gates the (zoa, COSMO)
    // step off entirely — the (hdr, COSMO) render step opens the FIRST
    // `beginRenderPass(loadOp: 'clear')` holding the enabled COSMO hdr draws,
    // the (mw-aggregate, NEAR0) step opens a SECOND pass against the cloud's
    // own offscreen for its star billboards, the (hdr, NEAR0) step opens a
    // THIRD hdr pass (loadOp: 'load') for the milky-way dust draw, then the
    // hdr→swap composite opens a FOURTH pass against the swap chain. So four
    // begins total; the FIRST is the COSMO HDR pass this test pins
    // (viewOf('hdr'), clear, a=1).
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
    // Signature: (pass, viewProj, viewportPx, settings: GalaxyPointDrawSettings).
    // The scalars are named fields on a single settings object.
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
    // selected null → 0xffffffff packed sentinel
    expect(drawSettings.selectedPacked).toBe(0xffffffff >>> 0);
    expect(drawSettings.visibleSourceMask).toBe(fx.settings.visibleSourceMask);
    // camPos is a 3-tuple snapshot from cam.position (asserted against the
    // fixture camera, not a literal — the camera distance derives from the
    // Milky-Way fade knobs).
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

  // Disk/thumbnail draws are produced by `proceduralDiskSubsystem.runFrame`
  // and `texturedDiskSubsystem.runFrame` upstream; the downstream layers
  // just issue renderer draws. Per-layer coverage lives in the matching
  // `passes/<name>Layer.test.ts` files.

  it("runs the hdr→swap composite after the HDR pass with blend 'replace' and the settings tone", () => {
    // The tone-map is the FRAME program's single composite step: the
    // Compositor merges the HDR target onto the swap chain. It draws INSIDE its
    // own render pass (opened by the executor against the swap view), after the
    // HDR pass ends — so the log has compositor.draw after pass.end.
    renderFrame(fx.input);
    const log = fx.callLog;
    const idxEnd = log.indexOf('pass.end');
    const idxComposite = log.indexOf('compositor.draw');
    expect(idxEnd).toBeGreaterThanOrEqual(0);
    expect(idxComposite).toBeGreaterThan(idxEnd);

    // Compositor.draw(pass, srcView, blend, tone): the src is the HDR target
    // view, the blend is 'replace', and the tone carries the settings exposure +
    // curve.
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
    // No-timing 'merged' path: zoneOfAvoidanceRenderer is null in this
    // fixture, so deriveZoneOfAvoidanceLiveness gates the (zoa, COSMO) step
    // off entirely — no pass opens for it. The (hdr, COSMO) render step
    // opens a pass holding the enabled COSMO hdr draws (here point-sprites;
    // the impostor subsystems are nulled out), closes it; the
    // (mw-aggregate, NEAR0) step opens a pass against the cloud's own
    // offscreen for its additive star billboards, closes it; the (hdr,
    // NEAR0) step opens an hdr pass for the cloud's multiplicative dust draw
    // (the cloud's slab, since the fixed COSMO near plane clipped its disc
    // mid-descent), closes it; then the hdr→swap composite opens a final
    // pass, draws the tone-map, and closes it — then finish + submit.
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
    // The program carries the near-field steps ((hdr, NEAR0), then the tail:
    // foreground:0 render → foreground:0→swap composite → NEAR0 swap render).
    // With the fixture's body/star renderers and foregroundLabelRenderer all
    // null, the (hdr, NEAR0) group selects only the cloud's dust + upsample
    // rows (one extra hdr pass) and the (mw-aggregate, NEAR0) step opens the
    // cloud's own offscreen pass; the foreground:0 render selects nothing, so
    // foreground:0 is never touched and the foreground:0→swap composite is
    // touched-set-skipped. Net: exactly four passes (hdr COSMO + mw-aggregate
    // + hdr NEAR0 + hdr→swap — zoneOfAvoidanceRenderer is null so the zoa
    // step stays gated off) and one compositor draw — no foreground:0
    // anywhere.
    renderFrame(fx.input);
    const calls = (fx.env.beginRenderPass as any).mock.calls as Array<[GPURenderPassDescriptor]>;
    expect(calls).toHaveLength(4);
    // No pass targets the foreground:0 offscreen or is labelled a foreground
    // composite.
    for (const [desc] of calls) {
      expect((desc as any).label).not.toContain('foreground:0');
    }
    // Only the single hdr→swap composite ran — the foreground composite was
    // skipped.
    expect(fx.compositor.draw).toHaveBeenCalledTimes(1);
    expect((fx.compositor.draw as ReturnType<typeof vi.fn>).mock.calls[0]![2]).toBe('replace');
  });

  it('opens the volume pass before the hdr pass when the scalar-volume layer is enabled', () => {
    // The FRAME program's volume render step precedes the hdr render step, so
    // when `deriveVolumeLiveness` is non-null the volume offscreen pass is the
    // FIRST beginRenderPass. The gate is the shared liveness — a
    // volumeFieldRenderer with active fields + volumes.enabled true drives it.
    const fx2 = makeInput({ settings: { volumesEnabled: true } });
    const drawSpy = vi.fn();
    (fx2.input.state as any).gpu.volumeFieldRenderer = {
      draw: drawSpy,
      hasActiveFields: () => true,
      listIds: () => [],
    };
    // volumeUpsampleLayer.draw self-guards on a null volumeUpsample — keep it
    // null so the upsample layer draws nothing; this test pins the volume pass
    // ordering. Its enabled() still tracks the SAME liveness (no desync).
    (fx2.input.state as any).gpu.volumeUpsample = null;
    // The volume offscreen view comes off ctx.renderTargets.viewOf('volume');
    // swap the backing record's row so the mock table serves it.
    const halfResView = { __id: 'half-res' } as unknown as GPUTextureView;
    fx2.renderTargetViews.volume = halfResView;

    renderFrame(fx2.input);

    // First beginRenderPass = the volume pass (clear a=0), before the hdr pass.
    const calls = (fx2.env.beginRenderPass as any).mock.calls as Array<[GPURenderPassDescriptor]>;
    expect(calls.length).toBeGreaterThanOrEqual(4); // volume + hdr + mw-aggregate + composite
    const firstAtt = Array.from(calls[0]![0].colorAttachments as any)[0] as any;
    expect(firstAtt.view).toBe(halfResView);
    expect(firstAtt.loadOp).toBe('clear');
    expect(firstAtt.clearValue).toEqual({ r: 0, g: 0, b: 0, a: 0 });

    // The renderer drew inside that pass.
    expect(drawSpy).toHaveBeenCalledTimes(1);
  });

  it('skips the volume pass and hides the volume-upsample layer when volumes are off', () => {
    // Default fixture: volumeFieldRenderer null → deriveVolumeLiveness null →
    // BOTH the scalar-volume producer and the volume-upsample consumer gate
    // off the same fact, so they cannot disagree. Wire a volumeUpsample spy to
    // prove the consumer is also hidden. Only the hdr + composite passes open
    // — zoneOfAvoidanceRenderer is null too, so the zoa step stays gated off.
    const upsampleDraw = vi.fn();
    (fx.input.state as any).gpu.volumeUpsample = { draw: upsampleDraw, destroy: vi.fn() };
    renderFrame(fx.input);
    const calls = (fx.env.beginRenderPass as any).mock.calls as Array<[GPURenderPassDescriptor]>;
    // hdr COSMO + mw-aggregate (cloud stars) + hdr NEAR0 (cloud dust) +
    // composite, no volume pass, no zoa pass.
    expect(calls).toHaveLength(4);
    // Neither the raymarch nor the upsample ran — the shared gate hid both.
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
});
