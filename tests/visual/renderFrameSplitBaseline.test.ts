/**
 * Visual baseline — renderFrame draw-command sequence (pre/post pass-split).
 *
 * Captures, in order, every renderer-level draw command the orchestrator
 * records during one call to `renderFrame`, irrespective of how many
 * `beginRenderPass` blocks the orchestrator opens to host those draws.
 *
 * Run pre-split (1 HDR mega-pass + tone-map post-process) the snapshot
 * recorded here is the baseline.  Run post-split (1 clear + 8 HDR
 * sub-passes + tone-map) the same fixture MUST still produce a
 * byte-identical hash — proving the split changed nothing about WHAT
 * the GPU is told to draw, only the boundary structure of the render
 * passes.
 *
 * ### Why we don't include `beginRenderPass` boundaries in the hash
 *
 * The whole point of Task 8 of the GPU-timestamp-query plan is to
 * split one mega-pass into 9 — that change WILL alter the number of
 * `beginRenderPass` calls.  If we included those in the hash, the
 * baseline would fail by definition after the split (defeating its
 * purpose).  Instead the hash captures the per-renderer draw payload
 * (renderer name + argument shape) — the encoder commands that
 * actually drive the GPU.
 *
 * ### Why we record at the renderer-mock level, not `pass.draw`
 *
 * Each `Pass.draw` in `passes/` delegates to a renderer's `.draw(...)`
 * method (`pointRenderer.draw`, `milkyWayRenderer.draw`, etc.) that we
 * stub at the test boundary.  The real renderers internally call
 * `pass.draw(vertexCount, instanceCount, ...)` on the GPU encoder, but
 * those WGSL-pipeline-bound calls never fire here — the mocks
 * short-circuit before the encoder ever sees `draw`.  Recording at
 * the renderer-mock entry point gives us "what did the orchestrator
 * dispatch?", which is the right granularity for the visual-
 * equivalence guarantee: same renderers, same args, same order.
 *
 * ### Why this fixture lights up every HDR pass
 *
 * To keep the snapshot a meaningful regression target we wire each of
 * the six HDR passes' `enabled` gates to return true (subsystems with
 * non-empty lastOutput, optional renderers non-null with positive
 * glyph/line counts, settings toggles on, camera inside the Milky-Way
 * fade band).  Result: 8 renderer-draw entries + 1 postProcess.draw.
 *
 * If the post-split renderFrame skips a pass, drops a draw, or
 * reorders the renderers, this snapshot fails.  That's the gate
 * Task 8 must respect.
 */

import { describe, it, expect, vi } from 'vitest';
import { Source } from '../../src/data/sources';
import { BiasMode } from '../../src/data/biasMode';
import { ToneMapCurve } from '../../src/data/toneMapCurve';
import { renderFrame } from '../../src/services/engine/frame/renderFrame';
import { createDisabledGpuTimingService } from '../../src/services/gpu/timing/gpuTimingService';
import type { OrbitCamera } from '../../src/@types/camera/OrbitCamera';
import type { GalaxyCatalog } from '../../src/@types/data/GalaxyCatalog';
import type { mat4 } from 'gl-matrix';
import type { SourceType } from '../../src/@types/data/Source';

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

function makePostProcess(records: DrawRecord[]): any {
  return {
    view: { __id: 'hdr-view' } as unknown as GPUTextureView,
    resize: vi.fn(),
    draw: vi.fn((...args: unknown[]) => {
      records.push({
        kind: 'rendererDraw',
        renderer: 'postProcess',
        argShape: describeArgs(args),
      });
    }),
    destroy: vi.fn(),
  };
}

// ── Domain fixture helpers (camera, point cloud) ───────────────────────────

function makeCam(): OrbitCamera {
  // Distance 5 Mpc → comfortably inside the Milky-Way fade band
  // (FADE_INNER_MPC = 10).  milkyWayPass.draw computes fadeAlpha > 0
  // and dispatches the impostor.
  return {
    target: [0, 0, 0] as unknown as Float32Array,
    distance: 5,
    yaw: 0,
    pitch: 0,
    fovYRad: (60 * Math.PI) / 180,
    aspect: 16 / 9,
    near: 0.001,
    far: 10000,
    position: new Float32Array([0, 0, 5]),
  } as unknown as OrbitCamera;
}

function makeCloud(count: number): GalaxyCatalog {
  const fill = (v: number): Float32Array => {
    const a = new Float32Array(count);
    a.fill(v);
    return a;
  };
  return {
    count,
    objIDs: new BigUint64Array(count),
    positions: new Float32Array(count * 3),
    magU: fill(20),
    magG: fill(20),
    magR: fill(20),
    magI: fill(20),
    magZ: fill(20),
    axisRatio: fill(1),
    positionAngleDeg: fill(0),
    diameterKpc: fill(50),
  };
}

// ── Test ───────────────────────────────────────────────────────────────────

describe('renderFrame visual baseline', () => {
  it('renderFrame draw-command sequence remains stable across pass-split', () => {
    const records: DrawRecord[] = [];

    const { encoder, pass: _pass } = makeEncoderEnv(records);
    const device = makeFakeDevice(records, encoder);
    const context = makeFakeContext();

    // Renderer mocks — each draw lands on the same `records` array.
    const pointRenderer = makeLoggingRenderer(records, 'point-sprites');
    const milkyWayRenderer = makeLoggingRenderer(records, 'milky-way');
    const proceduralDiskRenderer = makeLoggingRenderer(records, 'procedural-disks');
    const texturedDiskRenderer = makeLoggingRenderer(records, 'textured-disks');
    const filamentRenderer = makeLoggingRenderer(records, 'filaments');
    const scalarVolumeRenderer = {
      hasActiveFields: vi.fn(() => true),
      draw: vi.fn((...args: unknown[]) => {
        records.push({
          kind: 'rendererDraw',
          renderer: 'scalar-volume',
          argShape: describeArgs(args),
        });
      }),
    };
    // volumeUpsample is the state.gpu handle that volumeUpsamplePass.draw
    // calls directly (not via PassDeps).  Wire it with a logging draw so
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
      ...makeLoggingRenderer(records, 'labels', 'render'),
    };
    const markerLineRenderer = {
      lineCount: vi.fn(() => 3),
      ...makeLoggingRenderer(records, 'marker-lines', 'render'),
    };
    const postProcess = makePostProcess(records);

    const cam = makeCam();
    const catalogs = new Map([[Source.SDSS, makeCloud(1)]]);
    const canvasWidth = 1280;
    const canvasHeight = 720;
    const viewProj = new Float32Array(16) as unknown as mat4;
    const drawPxPerRad = canvasHeight / (2 * Math.tan(cam.fovYRad / 2));

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
    };

    const ctx = {
      isReady: true as const,
      cam,
      vp: viewProj,
      canvasSize: { width: canvasWidth, height: canvasHeight },
      drawCamPos: [cam.position[0]!, cam.position[1]!, cam.position[2]!] as Readonly<
        [number, number, number]
      >,
      drawPxPerRad,
      renderer: pointRenderer,
      postProcess,
      texturedDisks: texturedDisksSubsystem,
      // volumeUpsamplePass.draw reads ctx.volumeOffscreen.view to pass
      // as the source texture to the upsample step.
      volumeOffscreen: { view: {} as GPUTextureView },
    } as never;

    const settings = {
      pointSizePx: 2.5,
      brightness: 1.0,
      selected: null as { source: SourceType; localIdx: number } | null,
      visibleSourceMask: 0xffffffff,
      highlightFallback: true,
      realOnlyMode: false,
      biasMode: BiasMode.None,
      absMagLimit: -19,
      apparentMagLimit: 19.5,
      schechterMStar: -20.83,
      schechterAlpha: -1.2,
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
      // Engine state with every optional renderer wired in.  This is
      // what makes all eight HDR passes fire — pre-split today and
      // post-split tomorrow.
      state: {
        gpu: {
          labelRenderer,
          markerLineRenderer,
          selectionRingRenderer: null,
          scalarVolumeRenderer,
          volumeUpsample,
          clusterMarkerRenderer: null,
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
        },
        // DebugPanel renderer-toggle override bag — empty so every
        // pass fires (the visual baseline asserts the full lineup).
        debug: { disabledPasses: new Set<string>() },
      } as never,
      milkyWayITimeSec: 0,
      device,
      context,
      milkyWayRenderer: milkyWayRenderer as never,
      filamentRenderer: filamentRenderer as never,
      scalarVolumeRenderer: scalarVolumeRenderer as never,
      texturedDiskRenderer: texturedDiskRenderer as never,
      proceduralDiskRenderer: proceduralDiskRenderer as never,
      settings: settings as never,
      famousMeta: [],
      famousXrefs: {},
      catalogs,
      // Disabled stub forces the single-pass path.  The split-pass
      // (timing-on) shape is exercised in `renderFrame.timing.test.ts`.
      timingService: createDisabledGpuTimingService(),
    });

    // The hash payload — only renderer-level draws, with the order they
    // were emitted.  Render-pass boundaries (beginRenderPass / passEnd),
    // encoder.finish, and queue.submit are deliberately filtered out:
    // Future work (e.g. Task 9 wiring `encodeVolumes` before the HDR
    // mega-pass) will add more begin/end boundaries; filtering them
    // out here keeps THIS test stable across encoder-shape changes.
    const drawSequence = records
      .filter((r): r is Extract<DrawRecord, { kind: 'rendererDraw' }> => r.kind === 'rendererDraw')
      .map((r) => ({ renderer: r.renderer, argShape: r.argShape }));

    expect(drawSequence).toMatchInlineSnapshot(`
      [
        {
          "argShape": "pass,Float32Array[16],Array[2],Array[3],function",
          "renderer": "scalar-volume",
        },
        {
          "argShape": "pass,Float32Array[16],Array[2],object",
          "renderer": "point-sprites",
        },
        {
          "argShape": "pass,Float32Array[16],Array[2],Array[3],number,Array[1]",
          "renderer": "procedural-disks",
        },
        {
          "argShape": "pass,Float32Array[16],Array[2],Array[3],Array[1]",
          "renderer": "textured-disks",
        },
        {
          "argShape": "pass,Float32Array[16],Array[2],number,number,Array[3],Array[3]",
          "renderer": "milky-way",
        },
        {
          "argShape": "pass,Float32Array[16],Array[2],number,number,number",
          "renderer": "filaments",
        },
        {
          "argShape": "pass,object",
          "renderer": "volume-upsample",
        },
        {
          "argShape": "object,object,number,number,undefined",
          "renderer": "postProcess",
        },
        {
          "argShape": "pass,Float32Array[16],Array[2]",
          "renderer": "marker-lines",
        },
        {
          "argShape": "pass,Float32Array[16],Array[2]",
          "renderer": "labels",
        },
      ]
    `);

    // Boundary-event count for the no-timing path: THREE begin/end
    // pairs — one for the half-res scalar-volume pre-pass
    // (`encodeVolumes`, wired in Task 9), one for the HDR mega-pass
    // (`encodeHdrSingle`), and one for the post-tone-map UI overlay
    // (`encodeUiOverlay`).  Tone-map's beginRenderPass is hidden inside
    // postProcess.draw (the mock just records the call), so it doesn't
    // appear here.  Counts are asserted SEPARATELY from the inline
    // snapshot above on purpose: drawSequence captures the renderer-
    // dispatch invariant, these counts capture the pass-boundary structure.
    const beginCount = records.filter((r) => r.kind === 'beginRenderPass').length;
    const endCount = records.filter((r) => r.kind === 'passEnd').length;
    expect(beginCount).toBe(3);
    expect(endCount).toBe(3);
  });
});
