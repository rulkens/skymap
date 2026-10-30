/**
 * Visual baseline — renderFrame's draw-command sequence, independent of how many `beginRenderPass`
 * blocks host the draws, so a pass-split refactor must still hash byte-identically. Boundaries are
 * excluded on purpose: a split changes their count.
 *
 * Recorded at the renderer-mock entry point (the mocks short-circuit before `pass.draw`). The
 * cosmicHorizon Layer's shell is not composed in: its fade band mirrors the Milky Way's, so the two
 * never co-exist in one frame.
 */

import { describe, it, expect, vi } from 'vitest';
import { BiasMode } from '../../src/data/galaxyCatalog/biasMode';
import { ToneMapCurve } from '../../src/data/toneMapCurve';
import { DEFAULT_GALAXY_PROVENANCE } from '../../src/layers/galaxyCatalog/state/defaults';
import { renderFrame } from '../../src/services/engine/frame/renderFrame';
import { createFramePlannerResultStore } from '../../src/services/engine/frame/createFramePlannerResultStore';
import { createDisabledGpuTimingService } from '../../src/services/gpu/timing/gpuTimingService';
import { makeCosmoSlab } from '../fixtures/makeCosmoSlab';
import { makeGalaxyCatalogItems } from '../fixtures/makeGalaxyCatalogItems';
import { makeCubemapCaptureRuntimes } from '../helpers/engine/makeCubemapCaptureRuntimes';
import { MILKY_WAY_FADE_FULL_PX } from '../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { MILKY_WAY_RADIUS_MPC } from '../../src/data/milkyWay/milkyWayRadiusMpc';
import type { OrbitCamera } from '../../src/@types/camera/OrbitCamera';
import type { Mat4 } from 'wgpu-matrix';
import type { SourceType } from '../../src/@types/data/SourceType';
import type { Slab } from '../../src/@types/engine/frame/Slab';
import { CONTENT_PASSES } from '../../src/services/engine/frame/passes';
import { PRELUDE } from '../../src/data/rendering/frameSections';
import { stubPlannersFor } from '../helpers/frame/stubPlannersFor';
import type { FrameContentPlanner } from '../../src/@types/engine/frame/FrameContentPlanner';
import { galaxyPointSpritesPass } from '../../src/layers/galaxyCatalog/passes/galaxyPointSpritesPass';
import { proceduralDisksPass } from '../../src/layers/galaxyCatalog/passes/proceduralDisksPass';
import { texturedDisksPass } from '../../src/layers/galaxyCatalog/passes/texturedDisksPass';
import { filamentsPass } from '../../src/layers/cosmicWebFilaments/passes/filamentsPass';
import { gatePassByFade } from '../../src/services/engine/layer/gatePassByFade';
import { APP_VISIBILITY_REGISTRY } from '../../src/compositions/appVisibility';
import { cosmicWebDensityPass } from '../../src/layers/cosmicWebDensity/passes/cosmicWebDensityPass';
import { cosmicWebDensityUpsamplePass } from '../../src/layers/cosmicWebDensity/passes/cosmicWebDensityUpsamplePass';
import { milkyWayAggregatePass } from '../../src/layers/milkyWay/passes/milkyWayAggregatePass';
import { milkyWayUpsamplePass } from '../../src/layers/milkyWay/passes/milkyWayUpsamplePass';
import { milkyWayPass } from '../../src/layers/milkyWay/passes/milkyWayPass';
import type { CosmicWebDensityRuntime } from '../../src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime';
import type { GalaxyCatalogRuntime } from '../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import type { CosmicWebFilamentsRuntime } from '../../src/layers/cosmicWebFilaments/@types/CosmicWebFilamentsRuntime';
import type { MilkyWayRuntime } from '../../src/layers/milkyWay/@types/MilkyWayRuntime';
import { INITIAL_SETTINGS } from '../../src/state/settings/initialSettings';
import { idleGalaxyOctree } from '../fixtures/idleGalaxyOctree';

type DrawRecord =
  | { kind: 'beginRenderPass' }
  | { kind: 'passEnd' }
  | { kind: 'encoderFinish' }
  | { kind: 'queueSubmit' }
  | { kind: 'rendererDraw'; renderer: string; argShape: string };

/** Stringifies each argument's TYPE + LENGTH (not raw values, which vary with per-frame numbers): 'pass'
 *  for the mock encoder, `'<TypedArrayName>[<length>]'` for arrays, otherwise typeof. */
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
    const rec = arg as Record<string, unknown>;
    if (rec.__kind === 'pass') return 'pass';
    return 'object';
  }
  return typeof arg;
}

function describeArgs(args: ReadonlyArray<unknown>): string {
  return args.map(describeArg).join(',');
}

function makeFakeRenderPass(records: DrawRecord[]) {
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

function makeLoggingRenderer(records: DrawRecord[], name: string, method = 'draw') {
  const mock = vi.fn((...args: unknown[]) => {
    records.push({ kind: 'rendererDraw', renderer: name, argShape: describeArgs(args) });
  });
  return { [method]: mock };
}

function makeRenderTargets(): any {
  const views: Record<string, GPUTextureView> = {
    hdr: { __id: 'hdr-view' } as unknown as GPUTextureView,
    'cosmic-web-density': { __id: 'density-view' } as unknown as GPUTextureView,
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
      id: 'cosmic-web-density',
      format: 'rgba16float',
      depth: null,
      scale: 3,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
    },
    // milkyWayAggregatePass.draw reads this row's `scale` to size the
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
    // What a `{ sample }` step reads: no row here clears depth, so every
    // sampling step gets the far-cleared placeholder — `depthViewOf` is
    // unreachable here and deliberately absent.
    farDepthView: () => ({ __id: 'far-depth-view' }) as unknown as GPUTextureView,
    destroy: vi.fn(),
  };
}

function makeCompositor(records: DrawRecord[]): any {
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

// Fixture camera optics — the ctx built in the test body mirrors these.
// SCENE's `plan` row names 'structure-markers' by string — a stub with an
// empty result satisfies `runPlanSteps` without the marker producers' state.
// What `createLayers` gates each pass with: every fade resolves to 1 here.
const PASS_GATE_STATE = {
  subsystems: { fades: { opacityOf: () => 1 }, clipPlayer: { clipOpacityOf: () => 1 } },
  visibilityEntries: APP_VISIBILITY_REGISTRY,
} as unknown as Parameters<typeof gatePassByFade>[1];

const STUB_PLANNERS: readonly FrameContentPlanner<unknown>[] = [
  {
    name: 'structure-markers',
    scope: 'perView',
    plan: () => ({ value: [], awake: false, settling: false }),
  },
  ...stubPlannersFor(PRELUDE),
];

const FIXTURE_FOV_Y_RAD = (60 * Math.PI) / 180;
const FIXTURE_CANVAS_HEIGHT_PX = 720;

// Camera distance DERIVED from the Milky-Way fade knobs: the disc's apparent diameter is twice
// MILKY_WAY_FADE_FULL_PX under the fixture optics, so milkyWayFadeAlpha is 1 by construction and a
// fade re-tune moves this distance instead of silently dropping the pass from the snapshot.
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

describe('renderFrame visual baseline', () => {
  it('renderFrame draw-command sequence remains stable across pass-split', () => {
    const records: DrawRecord[] = [];

    const { encoder, pass: _pass } = makeEncoderEnv(records);
    const device = makeFakeDevice(records, encoder);
    const context = makeFakeContext();

    const galaxyPointRenderer = makeLoggingRenderer(records, 'point-sprites');
    // The cloud renderer has two entry points because its two passes target two
    // different textures: the additive stars into the reduced-resolution
    // `mw-aggregate` offscreen, the multiplicative dust full-res into HDR. Each
    // logs under the layer that dispatches it.
    const milkyWayCloudRenderer = {
      ...makeLoggingRenderer(records, 'milky-way-aggregate', 'drawStars'),
      ...makeLoggingRenderer(records, 'milky-way', 'drawDust'),
    };
    const aggregateUpsample = makeLoggingRenderer(records, 'milky-way-upsample');
    const milkyWayRuntime = {
      cloud: { buffers: () => ({ starBuf: {}, starCount: 1, dustBuf: null, dustCount: 0 }) },
      cloudRenderer: milkyWayCloudRenderer,
      aggregateUpsample,
    } as unknown as MilkyWayRuntime;
    const proceduralDiskRenderer = makeLoggingRenderer(records, 'procedural-disks');
    const texturedDiskRenderer = makeLoggingRenderer(records, 'textured-disks');
    const filamentRenderer = makeLoggingRenderer(records, 'filaments');
    const densityRenderer = {
      hasActiveFields: vi.fn(() => true),
      draw: vi.fn((...args: unknown[]) => {
        records.push({
          kind: 'rendererDraw',
          renderer: 'cosmic-web-density',
          argShape: describeArgs(args),
        });
      }),
    };
    const densityUpsample = {
      draw: vi.fn((...args: unknown[]) => {
        records.push({
          kind: 'rendererDraw',
          renderer: 'cosmic-web-density-upsample',
          argShape: describeArgs(args),
        });
      }),
    };
    const densityRuntime = {
      renderer: densityRenderer,
      upsample: densityUpsample,
    } as unknown as CosmicWebDensityRuntime;
    const labelRenderer = {
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
    // The HDR encoders index `ctx.slabs[COSMO]` via `slabViewOf`, so the fixture needs a real row there.
    const cosmoSlab: Slab = makeCosmoSlab({
      vp: Float64Array.from(viewProj as unknown as Float32Array),
    });

    // Non-empty lastOutput so the LOD-1 / LOD-2 passes' enabled() gates report true; the mocks log only
    // arg shapes, so one item per list suffices.
    const proceduralDisksSubsystem = {
      lastOutput: { instances: [{ stub: true }] as unknown[] },
    };
    const texturedDisksSubsystem = {
      lastOutput: {
        disks: [{ stub: true }] as unknown[],
      },
      hasInFlightWork: () => false,
    };

    const galaxyRuntime = {
      focusBindGroup: {} as GPUBindGroup,
      pointRenderer: galaxyPointRenderer,
      ...idleGalaxyOctree(),
      proceduralDiskRenderer,
      texturedDiskRenderer,
      proceduralDisks: proceduralDisksSubsystem,
      texturedDisks: texturedDisksSubsystem,
    } as unknown as GalaxyCatalogRuntime;

    const renderedTargets = new Set<string>();
    const ctx = {
      snapshot: {
        isReady: true as const,
        plans: createFramePlannerResultStore(),
        nowMs: 0,
        // The handed value's recession factor lerps on this; production
        // seeds it to 0 in frameContext, and an absent one yields NaN alphas.
        focusBlend: 0,
        slabBodyCandidates: [],
        bodyStates: new Map(),
        renderTargets,
        renderedTargets,
      },
      cam,
      vp: viewProj,
      slabs: [cosmoSlab, cosmoSlab],
      canvasSize: { width: canvasWidth, height: canvasHeight },
      drawCamPos: [cam.position[0]!, cam.position[1]!, cam.position[2]!] as Readonly<
        [number, number, number]
      >,
      drawPxPerRad,
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
      filamentsEnabled: true,
      filamentIntensity: 1,
      cosmicWebDensityEnabled: true,
    };

    renderFrame({
      canvas: ctx,
      views: [ctx],
      state: {
        viewRig: 'mono',
        gpu: {
          labelRendererCosmo: labelRenderer,
          label3DRenderer: null,
          markerLineRendererCosmo: markerLineRenderer,
          // Null so clipPathDebugPass stays disabled and the recorded
          // draw-command sequence baseline is unchanged.
          debugLineRenderer: null,
          selectionRingRenderer: null,
          compositor,
          // Near-field handles null: the near-field steps select nothing and the atmosphereShellPass /
          // atmosphereSkyView compute are disabled, so the recorded sequence and boundary counts stay the pure
          // cosmological shape this baseline pins.
          // Null (not absent) — scheduleProbeCapture's idle gate is `=== null`.
          meshBodyRenderer: null,
          orbitTrailRenderer: null,
          labelRendererNear: null,
          // Shared focus uniform — no-op write (doesn't touch the recorded
          // encoder); its bind group is bound identically in both the
          // single and split paths, so the sequence stays stable.
          focusUniform: { bindGroup: {}, write: () => {}, destroy: () => {} },
        },
        settings: {
          galaxyCatalogs: {
            sizePx: settings.pointSizePx,
            brightness: settings.brightness,
            provenance: DEFAULT_GALAXY_PROVENANCE,
            depthFade: settings.depthFadeEnabled,
            items: makeGalaxyCatalogItems(),
          },
          tonemap: { exposure: settings.exposure, curve: settings.toneMapCurve },
          // Bloom off: the split baseline captures the non-bloom program.
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
          fades: {
            register: vi.fn(),
            fadeTo: vi.fn(),
            setImmediate: vi.fn(),
            opacityOf: vi.fn(() => 1),
            isAnyAnimating: vi.fn(() => false),
            tick: vi.fn(),
            destroy: vi.fn(),
            label: 'fadeRegistry',
          },
          clipPlayer: { clipOpacityOf: () => 1 },
          cosmoLabelDirector: { labels: () => Array.from({ length: 12 }) },
        },
        cubemapCaptures: makeCubemapCaptureRuntimes(),
        // The COMPOSED list `createLayers` writes: core's registry plus each
        // Layer's passes, whose draws this baseline records. Array position is
        // not draw order — `expandFrameOrder` resolves each pass by name.
        passes: [
          ...CONTENT_PASSES,
          galaxyPointSpritesPass(galaxyRuntime),
          proceduralDisksPass(galaxyRuntime),
          texturedDisksPass(galaxyRuntime),
          filamentsPass({
            renderer: filamentRenderer,
            slot: {},
          } as unknown as CosmicWebFilamentsRuntime),
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
      // Disabled stub forces the single-pass path.  The split-pass
      // (timing-on) shape is exercised in `renderFrame.timing.test.ts`.
      timingService: createDisabledGpuTimingService(),
      renderedTargets,
    });

    // The hash payload: only renderer-level draws in emission order. Render-pass boundaries, encoder.finish
    // and queue.submit are filtered out so this stays stable across encoder-shape changes.
    const drawSequence = records
      .filter((r): r is Extract<DrawRecord, { kind: 'rendererDraw' }> => r.kind === 'rendererDraw')
      .map((r) => ({ renderer: r.renderer, argShape: r.argShape }));

    expect(drawSequence).toMatchInlineSnapshot(`
      [
        {
          "argShape": "pass,Float32Array[16],Array[2],number,Array[3],function,function",
          "renderer": "cosmic-web-density",
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
          "argShape": "pass,Float32Array[16],Array[2],number,Array[3],object,Array[1],undefined",
          "renderer": "textured-disks",
        },
        {
          "argShape": "pass,Float32Array[16],Array[2],number,number,number,number,Array[3],Array[3]",
          "renderer": "filaments",
        },
        {
          "argShape": "pass,object",
          "renderer": "cosmic-web-density-upsample",
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
          "argShape": "pass,Float32Array[16],Array[2],number,undefined",
          "renderer": "marker-lines",
        },
        {
          "argShape": "pass,Float32Array[16],Array[2],number,object",
          "renderer": "labels",
        },
      ]
    `);

    // Boundary-event count for the no-timing 'merged' path: SIX begin/end pairs, in FRAME-program order:
    // the density raymarch pass, the (hdr, COSMO) mega-pass, the (mw-aggregate, NEAR0) cloud star pass, the
    // (hdr, NEAR0) cloud upsample + dust pass (own slab since the fixed COSMO near plane clipped the disc
    // mid-descent), the hdr→swap composite, and the swap-chain overlay pass. Asserted SEPARATELY from the
    // inline snapshot: drawSequence captures the dispatch invariant, these counts the pass-boundary structure.
    const beginCount = records.filter((r) => r.kind === 'beginRenderPass').length;
    const endCount = records.filter((r) => r.kind === 'passEnd').length;
    expect(beginCount).toBe(6);
    expect(endCount).toBe(6);
  });
});
