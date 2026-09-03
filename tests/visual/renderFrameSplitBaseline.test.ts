/**
 * Visual baseline — renderFrame's draw-command sequence, independent of how many
 * `beginRenderPass` blocks host those draws, so a pass-split refactor must still
 * hash byte-identically. Boundaries are excluded on purpose: a split changes their
 * count, which would fail the baseline by definition.
 *
 * Recorded at the renderer-mock entry point, not `pass.draw` on the encoder — the
 * mocks short-circuit first, so "what did the orchestrator dispatch?" is the only
 * observable granularity. The horizon shell is excluded: its fade band mirrors the
 * Milky Way's, so the two never co-exist in one frame.
 */

import { describe, it, expect, vi } from 'vitest';
import { BiasMode } from '../../src/data/galaxyCatalog/biasMode';
import { ToneMapCurve } from '../../src/data/toneMapCurve';
import { DEFAULT_GALAXY_PROVENANCE } from '../../src/data/defaults';
import { renderFrame } from '../../src/services/engine/frame/renderFrame';
import { createDisabledGpuTimingService } from '../../src/services/gpu/timing/gpuTimingService';
import { makeCosmoSlab } from '../fixtures/makeCosmoSlab';
import {
  MILKY_WAY_FADE_FULL_PX,
  MILKY_WAY_RADIUS_MPC,
} from '../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';
import type { OrbitCamera } from '../../src/@types/camera/OrbitCamera';
import type { Mat4 } from 'wgpu-matrix';
import type { SourceType } from '../../src/@types/data/SourceType';
import type { Slab } from '../../src/@types/engine/frame/Slab';

// ── Recording harness ──────────────────────────────────────────────────────
//
// Every interesting event the orchestrator emits is pushed onto a single
// `DrawRecord[]`.  We use a discriminated `kind` so the snapshot reader can
// tell renderer draws apart from boundary events at a glance, and so the
// per-pass filter (drop boundary events from the hash) is one .filter() call.

type DrawRecord =
  | { kind: 'beginRenderPass' }
  | { kind: 'passEnd' }
  | { kind: 'encoderFinish' }
  | { kind: 'queueSubmit' }
  | { kind: 'rendererDraw'; renderer: string; argShape: string };

/**
 * Cheap, allocation-light "argument shape" stringifier.  We don't snapshot
 * raw values — those vary with the per-frame derived numbers (pxPerRad,
 * canvas size).  Instead we stringify the TYPE + LENGTH of each argument:
 * - `pass` (the GPURenderPassEncoder mock) → `'pass'`
 * - typed arrays / arrays → `'<TypedArrayName>[<length>]'`
 * - objects → `'object'`
 * - numbers → `'number'`
 * - everything else → typeof
 *
 * This captures "the call site delivered N args of these kinds" which is
 * what the visual-equivalence claim actually cares about — Task 8 splits
 * the render pass boundaries, NOT the per-renderer call signatures.
 */
function describeArg(arg: unknown): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'number') return 'number';
  if (typeof arg === 'boolean') return 'boolean';
  if (typeof arg === 'string') return 'string';
  if (arg instanceof Float32Array) return `Float32Array[${arg.length}]`;
  if (arg instanceof Float64Array) return `Float64Array[${arg.length}]`;
  if (arg instanceof Uint32Array) return `Uint32Array[${arg.length}]`;
  if (Array.isArray(arg)) return `Array[${arg.length}]`;
  if (typeof arg === 'object') {
    // Detect the pass-encoder sentinel we stuff into our mock pass.
    const rec = arg as Record<string, unknown>;
    if (rec.__kind === 'pass') return 'pass';
    return 'object';
  }
  return typeof arg;
}

function describeArgs(args: ReadonlyArray<unknown>): string {
  return args.map(describeArg).join(',');
}

// ── WebGPU mock fabricators ────────────────────────────────────────────────

function makeFakeRenderPass(records: DrawRecord[]) {
  // The pass object is identified by a __kind tag so describeArg can
  // collapse it to the short label `'pass'` instead of `'object'`.
  return {
    __kind: 'pass',
    end: vi.fn(() => {
      records.push({ kind: 'passEnd' });
    }),
    setPipeline: vi.fn(),
    setVertexBuffer: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
    drawIndexed: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

function makeEncoderEnv(records: DrawRecord[]) {
  const pass = makeFakeRenderPass(records);
  const finishedBuffer = {} as GPUCommandBuffer;
  const beginRenderPass = vi.fn((_desc: GPURenderPassDescriptor) => {
    records.push({ kind: 'beginRenderPass' });
    return pass;
  });
  const finish = vi.fn(() => {
    records.push({ kind: 'encoderFinish' });
    return finishedBuffer;
  });
  const encoder = { beginRenderPass, finish } as unknown as GPUCommandEncoder;
  return { encoder, pass };
}

function makeFakeDevice(records: DrawRecord[], encoder: GPUCommandEncoder) {
  const submit = vi.fn(() => {
    records.push({ kind: 'queueSubmit' });
  });
  return {
    createCommandEncoder: vi.fn(() => encoder),
    queue: { submit },
  } as unknown as GPUDevice;
}

function makeFakeContext(): GPUCanvasContext {
  return {
    getCurrentTexture: vi.fn(() => ({
      createView: vi.fn(() => ({}) as GPUTextureView),
    })),
  } as unknown as GPUCanvasContext;
}

// ── Renderer mocks that log into the records array ─────────────────────────
//
// Each renderer mock's `.draw` (or `.render`) pushes a `rendererDraw` event
// carrying its own short name + the stringified arg shape.  This is the
// SEQUENCE the snapshot pins.

function makeLoggingRenderer(records: DrawRecord[], name: string, method = 'draw') {
  const mock = vi.fn((...args: unknown[]) => {
    records.push({ kind: 'rendererDraw', renderer: name, argShape: describeArgs(args) });
  });
  return { [method]: mock };
}

function makeRenderTargets(): any {
  // The offscreen target table — the executor resolves the hdr + volume
  // colour attachments via viewOf(id); the tone-map blit is the FRAME
  // program's `hdr→swap` composite (see makeCompositor).
  const views: Record<string, GPUTextureView> = {
    hdr: { __id: 'hdr-view' } as unknown as GPUTextureView,
    volume: { __id: 'volume-view' } as unknown as GPUTextureView,
    'mw-aggregate': { __id: 'mw-aggregate-view' } as unknown as GPUTextureView,
  };
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
      id: 'volume',
      format: 'rgba16float',
      depth: null,
      scale: 3,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
    },
    // milkyWayAggregateLayer.draw reads this row's `scale` to size the
    // downscaled viewport it hands the cloud's star pass.
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
  };
}

function makeCompositor(records: DrawRecord[]): any {
  // The FRAME program's single composite step: the Compositor tone-maps the
  // HDR target onto the swap chain inside a render pass the executor opens.
  return {
    label: 'compositor',
    draw: vi.fn((...args: unknown[]) => {
      records.push({
        kind: 'rendererDraw',
        renderer: 'compositor',
        argShape: describeArgs(args),
      });
    }),
    destroy: vi.fn(),
  };
}

// ── Domain fixture helpers (camera, point cloud) ───────────────────────────

// Fixture camera optics — the ctx built in the test body mirrors these.
const FIXTURE_FOV_Y_RAD = (60 * Math.PI) / 180;
const FIXTURE_CANVAS_HEIGHT_PX = 720;

// Camera distance DERIVED from the Milky-Way fade knobs: at this distance
// the disc's apparent diameter is twice MILKY_WAY_FADE_FULL_PX under the
// fixture optics, so milkyWayFadeAlpha is 1 by construction and the
// milky-way entry stays in the baseline draw sequence. A visual-gate
// re-tune of the fade band moves this distance instead of silently
// dropping the pass from the snapshot.
const MW_ALIVE_DIST_MPC =
  (2 * MILKY_WAY_RADIUS_MPC * (FIXTURE_CANVAS_HEIGHT_PX / (2 * Math.tan(FIXTURE_FOV_Y_RAD / 2)))) /
  (2 * MILKY_WAY_FADE_FULL_PX);

function makeCam(): OrbitCamera {
  // Camera close enough that the Milky-Way disc sits safely above its FULL
  // apparent size (MW_ALIVE_DIST_MPC), so milkyWayLayer.draw computes
  // fadeAlpha > 0 and dispatches the impostor.
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

// ── Test ───────────────────────────────────────────────────────────────────

describe('renderFrame visual baseline', () => {
  it('renderFrame draw-command sequence remains stable across pass-split', () => {
    const records: DrawRecord[] = [];

    const { encoder, pass: _pass } = makeEncoderEnv(records);
    const device = makeFakeDevice(records, encoder);
    const context = makeFakeContext();

    // Renderer mocks — each draw lands on the same `records` array.
    const galaxyPointRenderer = makeLoggingRenderer(records, 'point-sprites');
    // The cloud renderer has two entry points because its two passes target two
    // different textures: the additive stars into the reduced-resolution
    // `mw-aggregate` offscreen, the multiplicative dust full-res into HDR. Each
    // logs under the layer that dispatches it.
    const milkyWayCloudRenderer = {
      ...makeLoggingRenderer(records, 'milky-way-aggregate', 'drawStars'),
      ...makeLoggingRenderer(records, 'milky-way', 'drawDust'),
    };
    // milkyWayAggregateUpsample is the state.gpu handle milkyWayUpsampleLayer.draw
    // calls directly, the twin of volumeUpsample below — wired with a logging
    // draw so the snapshot captures the offscreen's merge back into HDR.
    const milkyWayAggregateUpsample = makeLoggingRenderer(records, 'milky-way-upsample');
    const horizonShellRenderer = makeLoggingRenderer(records, 'horizon-shell');
    const proceduralDiskRenderer = makeLoggingRenderer(records, 'procedural-disks');
    const texturedDiskRenderer = makeLoggingRenderer(records, 'textured-disks');
    const filamentRenderer = makeLoggingRenderer(records, 'filaments');
    const volumeFieldRenderer = {
      hasActiveFields: vi.fn(() => true),
      draw: vi.fn((...args: unknown[]) => {
        records.push({
          kind: 'rendererDraw',
          renderer: 'scalar-volume',
          argShape: describeArgs(args),
        });
      }),
    };
    // volumeUpsample is the state.gpu handle that volumeUpsampleLayer.draw
    // calls directly off `state.gpu.*`.  Wire it with a logging draw so
    // the snapshot captures the upsample step.
    const volumeUpsample = {
      draw: vi.fn((...args: unknown[]) => {
        records.push({
          kind: 'rendererDraw',
          renderer: 'volume-upsample',
          argShape: describeArgs(args),
        });
      }),
    };
    const labelRenderer = {
      glyphCount: vi.fn(() => 12),
      ...makeLoggingRenderer(records, 'labels'),
    };
    const markerLineRenderer = {
      lineCount: vi.fn(() => 3),
      ...makeLoggingRenderer(records, 'marker-lines'),
    };
    const renderTargets = makeRenderTargets();
    const compositor = makeCompositor(records);

    const cam = makeCam();
    const canvasWidth = 1280;
    const canvasHeight = FIXTURE_CANVAS_HEIGHT_PX;
    const viewProj = new Float32Array(16) as unknown as Mat4;
    const drawPxPerRad = canvasHeight / (2 * Math.tan(cam.fovYRad / 2));
    // The HDR encoders resolve one SlabView (COSMO) before the layer loop
    // via `slabViewOf(ctx, COSMO)`, which indexes `ctx.slabs[COSMO]`
    // directly — this fixture needs a real row there, not the pre-slab
    // `slabs: []` shape.
    const cosmoSlab: Slab = makeCosmoSlab({
      vp: Float64Array.from(viewProj as unknown as Float32Array),
    });

    // Subsystems with non-empty lastOutput so the LOD-1 / LOD-2 passes'
    // enabled() gates report true.  We populate one item in each list —
    // the exact instance shape doesn't matter because our renderer mocks
    // log only the arg-shape, not the per-element contents.
    const proceduralDisksSubsystem = {
      lastOutput: { instances: [{ stub: true }] as unknown[] },
    };
    const texturedDisksSubsystem = {
      lastOutput: {
        disks: [{ stub: true }] as unknown[],
      },
      hasInFlightWork: () => false,
    };

    const ctx = {
      isReady: true as const,
      // executor populates this as targets render; a later pass reads which rendered this frame.
      renderedTargets: new Set<string>(),
      cam,
      vp: viewProj,
      slabs: [cosmoSlab, cosmoSlab],
      canvasSize: { width: canvasWidth, height: canvasHeight },
      drawCamPos: [cam.position[0]!, cam.position[1]!, cam.position[2]!] as Readonly<
        [number, number, number]
      >,
      drawPxPerRad,
      nowMs: 0,
      // resolveLayerOpacity's recession factor lerps on this; production seeds
      // it to 0 in frameContext, and an absent one yields NaN alphas here.
      focusBlend: 0,
      fovYRad: FIXTURE_FOV_Y_RAD,
      galaxyPointRenderer,
      // The executor resolves hdr/volume attachments — and volumeUpsampleLayer
      // its source texture — via ctx.renderTargets.viewOf(id).
      renderTargets,
      texturedDisks: texturedDisksSubsystem,
    } as never;

    const settings = {
      pointSizePx: 2.5,
      brightness: 1.0,
      selected: null as { source: SourceType; localIdx: number } | null,
      visibleSourceMask: 0xffffffff,
      biasMode: BiasMode.None,
      absMagLimit: -19,
      depthFadeEnabled: true,
      pxFadeStartPoints: 8,
      pxFadeEndPoints: 14,
      exposure: 1.0,
      toneMapCurve: ToneMapCurve.Reinhard,
      galaxyTexturesEnabled: true,
      milkyWayEnabled: true,
      filamentsEnabled: true,
      filamentIntensity: 1,
      volumesEnabled: true,
    };

    renderFrame({
      ctx,
      // Engine state with every optional renderer wired in — this is what
      // makes all eight HDR passes fire.
      state: {
        gpu: {
          labelRenderer,
          markerLineRenderer,
          // Null so clipPathDebugLayer stays disabled and the recorded
          // draw-command sequence baseline is unchanged.
          debugLineRenderer: null,
          // Null so the ZoA guide band stays out of the pinned sequence — it
          // was held out only by the fixture's absent focusBlend before.
          zoneOfAvoidanceRenderer: null,
          selectionRingRenderer: null,
          volumeFieldRenderer,
          // Flow is CONTENT_LAYERS row 5 (see passes/index.ts); here it
          // stays off (null renderer + disabled below) so encodeFlowCompute
          // is a no-op and the recorded single-vs-split sequence is
          // unchanged.
          flowFieldRenderer: null,
          volumeUpsample,
          // The FRAME program's hdr→swap composite reads state.gpu.compositor.
          compositor,
          structureMarkerRenderer: null,
          // Near-field handles null → the program's (hdr, NEAR0) star-point
          // render, foreground:0 render, and NEAR0 caption render all select
          // nothing, and the foreground:0→swap composite is
          // touched-set-skipped. The recorded draw sequence + pass-boundary
          // counts stay the pure cosmological shape this baseline pins.
          earthRenderer: null,
          starRenderer: null,
          planetRenderer: null,
          // Near-field handle null → atmosphereShellLayer disabled AND the
          // atmosphereSkyView compute step early-outs, so the recorded draw
          // sequence stays the pure cosmological shape this baseline pins.
          atmosphereShellRenderer: null,
          starPointRenderer: null,
          orbitTrailRenderer: null,
          starCatalogRenderer: null,
          foregroundLabelRenderer: null,
          // milkyWayLayer.draw reads the generated cloud buffers off this handle.
          milkyWayCloud: {
            buffers: () => ({ starBuf: {}, starCount: 1, dustBuf: null, dustCount: 0 }),
          },
          // Every `ContentLayer.draw` reads its renderer straight off
          // `state.gpu.*` — this is the ONLY place these mock instances are
          // wired in (no top-level `renderFrame` input field duplication;
          // see `RenderFrameInput`'s slimmed shape). The local names below
          // (`milkyWayCloudRenderer`, `horizonShellRenderer`,
          // `proceduralDiskRenderer`, `texturedDiskRenderer`,
          // `filamentRenderer`) are the same logging-renderer instances
          // declared above, so their `argShape` entries land in `records`.
          milkyWayCloudRenderer,
          milkyWayAggregateUpsample,
          horizonShellRenderer,
          proceduralDiskRenderer,
          texturedDiskRenderer,
          filamentRenderer,
          // Shared focus uniform — no-op write (doesn't touch the recorded
          // encoder); its bind group is bound identically in both the
          // single and split paths, so the sequence stays stable.
          focusUniform: { bindGroup: {}, write: () => {}, destroy: () => {} },
        },
        // encodeFlowCompute (pre-HDR) reads these; default-off → gate returns.
        // A null slot → slotReady false → not loaded.
        // The encoders read the renderer-toggle override bag off
        // `settings.debug.disabledPasses`; empty so every pass fires.
        settings: {
          galaxyCatalogs: {
            sizePx: settings.pointSizePx,
            brightness: settings.brightness,
            provenance: DEFAULT_GALAXY_PROVENANCE,
            depthFade: settings.depthFadeEnabled,
          },
          tonemap: { exposure: settings.exposure, curve: settings.toneMapCurve },
          // Bloom off: the split baseline captures the non-bloom program.
          bloom: { enabled: false, strength: 1, threshold: 1 },
          bias: { mode: settings.biasMode, absMagLimit: settings.absMagLimit },
          thumbnails: { enabled: settings.galaxyTexturesEnabled },
          milkyWay: { enabled: settings.milkyWayEnabled },
          filaments: { enabled: settings.filamentsEnabled, intensity: settings.filamentIntensity },
          constellations: { enabled: false, intensity: 1 },
          volumes: { enabled: settings.volumesEnabled, items: {} },
          flow: { enabled: false },
          debug: { disabledPasses: {}, renderStrategy: 'auto' },
        },
        selection: { select: settings.selected },
        assetSlots: { flow: null },
        // Pick-throttle bag; the content passes don't touch it, but the
        // engine-state shape carries it.
        picking: {
          pickInFlight: false,
          pointerDown: false,
        },
        subsystems: {
          proceduralDisks: proceduralDisksSubsystem,
          texturedDisks: texturedDisksSubsystem,
          fades: {
            register: vi.fn(),
            unregister: vi.fn(),
            fadeTo: vi.fn(() => Promise.resolve()),
            setImmediate: vi.fn(),
            opacityOf: vi.fn(() => 1),
            isAnyAnimating: vi.fn(() => false),
            tick: vi.fn(),
            destroy: vi.fn(),
            label: 'fadeRegistry',
          },
          clipPlayer: { clipOpacityOf: () => 1 },
        },
        // The sky-cubemap capture bookkeeping — see the matching fixture
        // comment in renderFrame.test.ts.
        cameraRuntime: {
          skyCubemapCapture: {
            bandActive: false,
            gcDistanceMpc: Number.POSITIVE_INFINITY,
            bakedFrom: null,
          },
        },
      } as never,
      device,
      context,
      // Disabled stub forces the single-pass path.  The split-pass
      // (timing-on) shape is exercised in `renderFrame.timing.test.ts`.
      timingService: createDisabledGpuTimingService(),
    });

    // The hash payload — only renderer-level draws, with the order they
    // were emitted.  Render-pass boundaries (beginRenderPass / passEnd),
    // encoder.finish, and queue.submit are deliberately filtered out, so
    // this test stays stable across encoder-shape changes (e.g. the
    // `frameProgram`'s volume render step opening its own pass before the
    // HDR render step).
    const drawSequence = records
      .filter((r): r is Extract<DrawRecord, { kind: 'rendererDraw' }> => r.kind === 'rendererDraw')
      .map((r) => ({ renderer: r.renderer, argShape: r.argShape }));

    expect(drawSequence).toMatchInlineSnapshot(`
      [
        {
          "argShape": "pass,Float32Array[16],Array[2],Array[3],function,function",
          "renderer": "scalar-volume",
        },
        {
          "argShape": "pass,Float32Array[16],Array[2],object",
          "renderer": "point-sprites",
        },
        {
          "argShape": "pass,Float32Array[16],Array[2],Array[3],number,object,Array[1]",
          "renderer": "procedural-disks",
        },
        {
          "argShape": "pass,Float32Array[16],Array[2],Array[3],object,Array[1],undefined",
          "renderer": "textured-disks",
        },
        {
          "argShape": "pass,Float32Array[16],Array[2],number,number,number,Array[3],Array[3]",
          "renderer": "filaments",
        },
        {
          "argShape": "pass,object",
          "renderer": "volume-upsample",
        },
        {
          "argShape": "pass,object",
          "renderer": "milky-way-aggregate",
        },
        {
          "argShape": "pass,object",
          "renderer": "milky-way-upsample",
        },
        {
          "argShape": "pass,object",
          "renderer": "milky-way",
        },
        {
          "argShape": "pass,object,string,object,string",
          "renderer": "compositor",
        },
        {
          "argShape": "pass,Float32Array[16],Array[2],undefined",
          "renderer": "marker-lines",
        },
        {
          "argShape": "pass,Float32Array[16],Array[2],undefined",
          "renderer": "labels",
        },
      ]
    `);

    // Boundary-event count for the no-timing 'merged' path: SIX begin/end
    // pairs — one per non-empty render step's target group plus the composite.
    // In FRAME-program order: the volume raymarch pass, the (hdr, COSMO)
    // mega-pass, the (mw-aggregate, NEAR0) pass (the cloud's additive star
    // billboards into their own reduced-resolution offscreen), the
    // (hdr, NEAR0) pass (the cloud's upsample + dust, on their own slab since
    // the fixed COSMO near plane clipped the disc mid-descent), the hdr→swap
    // composite pass, and the swap-chain overlay pass (marker-lines +
    // labels). The tone-map's beginRenderPass is not hidden inside a bespoke
    // blit helper — the executor opens the composite pass, so it appears
    // here. Counts are asserted SEPARATELY from the inline snapshot:
    // drawSequence captures the renderer-dispatch invariant, these counts
    // capture the pass-boundary structure.
    const beginCount = records.filter((r) => r.kind === 'beginRenderPass').length;
    const endCount = records.filter((r) => r.kind === 'passEnd').length;
    expect(beginCount).toBe(6);
    expect(endCount).toBe(6);
  });
});
