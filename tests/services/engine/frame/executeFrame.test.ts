/**
 * executeFrame — unit tests for the strategy-parameterized frame executor.
 *
 * The executor walks a `FrameStep[]` program into one command encoder, drawing
 * each render step's own pass list behind that pass's gate, dispatching
 * composites through the Compositor, and resolving compute steps against the
 * composed `state.computes` list (covered in `executeFrame.computes.test.ts`).
 * We mock the encoder, the render passes, the compositor, and the content
 * passes (object literals with spy `enabled`/`draw`), so the whole thing runs
 * without a real WebGPU device.
 *
 * The behaviour-neutrality contract these tests pin (program order, one-pass-
 * per-non-empty-group under 'merged', per-layer timed passes under
 * 'perLayerTimed', first-touch clear vs later load, the touched-set composite
 * gate) is the same behaviour the pre-unification hand-wired HDR-encode +
 * inline tone-map + UI-overlay call chain produced.
 */

import { describe, it, expect, vi } from 'vitest';
import { executeFrame } from '../../../../src/services/engine/frame/executeFrame';
import { COSMO, NEAR0 } from '../../../../src/services/engine/frame/slabs';
import { makeCosmoSlab } from '../../../fixtures/makeCosmoSlab';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { ExecuteFrameArgs } from '../../../../src/@types/engine/frame/ExecuteFrameArgs';
import type { FrameStep } from '../../../../src/@types/engine/frame/FrameStep';
import type { ContentPass } from '../../../../src/@types/engine/frame/ContentPass';
import type { RenderStrategy } from '../../../../src/@types/engine/frame/RenderStrategy';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { GpuTimingService } from '../../../../src/@types/gpu/timing/GpuTimingService';
import type { TimingSlotName } from '../../../../src/@types/gpu/timing/TimingSlotName';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { CubeFace } from '../../../../src/@types/rendering/CubeFace';
import type { CaptureFaceContexts } from '../../../../src/@types/engine/frame/CaptureFaceContexts';

// ── Encoder / pass recorder ──────────────────────────────────────────────────
//
// `beginRenderPass` records each descriptor + the pass object it returned, so
// a test can correlate "which layer drew into which pass carrying which
// timestamp descriptor" by reference-matching the pass a layer.draw spy saw
// against the recorded list.

type PassRecord = { desc: GPURenderPassDescriptor; pass: GPURenderPassEncoder; ended: boolean };

function makeEncoderEnv() {
  const passes: PassRecord[] = [];
  const order: string[] = [];
  const beginRenderPass = vi.fn((desc: GPURenderPassDescriptor) => {
    const rec: PassRecord = {
      desc,
      pass: null as unknown as GPURenderPassEncoder,
      ended: false,
    };
    const pass = {
      end: vi.fn(() => {
        rec.ended = true;
      }),
    } as unknown as GPURenderPassEncoder;
    rec.pass = pass;
    passes.push(rec);
    order.push('beginRenderPass');
    return pass;
  });
  const encoder = { beginRenderPass } as unknown as GPUCommandEncoder;
  return { encoder, passes, order, beginRenderPass };
}

// ── Fake timing service ──────────────────────────────────────────────────────
//
// `descriptorFor` tags its querySet with the slot name (`{ _stub: slot }`) so a
// test can assert "the descriptor for slot X landed on pass X" rather than
// merely "some descriptor landed". The `slots` set gates which names resolve —
// a name outside it returns undefined, matching the real no-slot degradation.

function makeTimingService(slots?: Set<string>) {
  const descriptorFor = vi.fn((slot: TimingSlotName) => {
    if (slots && !slots.has(slot)) return undefined;
    return {
      querySet: { _stub: slot } as unknown as GPUQuerySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1,
    };
  });
  const svc = {
    enabled: true,
    beginFrame: vi.fn(),
    descriptorFor,
    endFrame: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    destroy: vi.fn(),
  } as unknown as GpuTimingService;
  return { svc, descriptorFor };
}

/** No-op timing service — `descriptorFor` always returns undefined. */
function makeNoTiming(): GpuTimingService {
  return {
    enabled: false,
    beginFrame: vi.fn(),
    descriptorFor: vi.fn(() => undefined),
    endFrame: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    destroy: vi.fn(),
  } as unknown as GpuTimingService;
}

// ── Fake content layer ───────────────────────────────────────────────────────

type SpyPass = ContentPass & {
  enabled: ReturnType<typeof vi.fn<ContentPass['enabled']>>;
  draw: ReturnType<typeof vi.fn<ContentPass['draw']>>;
};

function makeContentPass(init: {
  name: string;
  enabled?: boolean;
  // Per-row gate for a body-roster pass: reads the resolved view (e.g. its
  // `slab.frame.hostId`) instead of the constant `enabled` flag above.
  enabledFor?: (view: SlabView) => boolean;
  log?: string[];
}): SpyPass {
  return {
    name: init.name,
    enabled: vi.fn<ContentPass['enabled']>((_state, _ctx, view) =>
      init.enabledFor ? init.enabledFor(view) : (init.enabled ?? true),
    ),
    draw: vi.fn<ContentPass['draw']>(() => {
      init.log?.push(`draw:${init.name}`);
    }),
  };
}

// ── Fake ctx / state ─────────────────────────────────────────────────────────

const HDR_VIEW = { __id: 'hdr-view' } as unknown as GPUTextureView;
const DENSITY_VIEW = { __id: 'density-view' } as unknown as GPUTextureView;
const FG_VIEW = { __id: 'foreground-view' } as unknown as GPUTextureView;
const FG_DEPTH_VIEW = { __id: 'foreground-depth-view' } as unknown as GPUTextureView;
const FAR_VIEW = { __id: 'far-depth-placeholder-view' } as unknown as GPUTextureView;
const SWAP_VIEW = { __id: 'swap-view' } as unknown as GPUTextureView;
const SKY_CUBEMAP_VIEW = { __id: 'sky-cubemap-view' } as unknown as GPUTextureView;
// One distinct view per capture face — proves `layerViewOf` (not the shared
// `viewOf`) resolves a capture step's colour attachment, and that each face
// lands on its OWN layer rather than all six colliding on one.
const SKY_CUBEMAP_FACE_VIEWS: readonly GPUTextureView[] = [0, 1, 2, 3, 4, 5].map(
  (face) => ({ __id: `sky-cubemap-face${face}-view` }) as unknown as GPUTextureView,
);

const EXEC_SPECS = [
  {
    id: 'hdr',
    format: 'rgba16float' as const,
    depth: null,
    scale: 1,
    clearValue: { r: 0, g: 0, b: 0, a: 1 },
  },
  {
    id: 'cosmic-web-density',
    format: 'rgba16float' as const,
    depth: null,
    scale: 3,
    clearValue: { r: 0, g: 0, b: 0, a: 0 },
  },
  {
    id: 'foreground:0',
    format: 'rgba16float' as const,
    depth: 'depth32float' as const,
    scale: 1,
    clearValue: { r: 0, g: 0, b: 0, a: 0 },
  },
  {
    id: 'swap',
    format: 'bgra8unorm' as const,
    depth: null,
    scale: 1,
    clearValue: { r: 0, g: 0, b: 0, a: 1 },
  },
  {
    id: 'sky-cubemap',
    format: 'rgba16float' as const,
    depth: null,
    scale: 1,
    clearValue: { r: 0, g: 0, b: 0, a: 0 },
    fixedSizePx: { size: 256, layers: 6 },
  },
];

function makeCtx(): FrameView {
  const slab: Slab = makeCosmoSlab();
  // Offscreen view resolution goes through the target table's viewOf —
  // the executor's viewFor keeps only the swap-vs-offscreen branch. `specs`
  // + `depthViewOf` let the executor discover which target rows declare a
  // depth attachment (only `foreground:0` here). `specOf` is what
  // `colorAttachment`/`depthAttachment`/the composite's dstFormat read —
  // clear values here match production (`hdr`/`swap` at a=1, the rest
  // a=0) so a clear-value regression would show up in the clear/load
  // assertions below. Frame-owned (`ReadyFrameContext.renderTargets`), so it
  // nests under `snapshot` — `executeFrame` reads it as `ctx.snapshot.renderTargets`.
  const renderTargets = {
    specs: EXEC_SPECS,
    specOf: (id: string) => {
      const spec = EXEC_SPECS.find((s) => s.id === id);
      if (!spec) throw new Error(`mock renderTargets: no spec row for '${id}'`);
      return spec;
    },
    viewOf: (id: string) => {
      if (id === 'hdr') return HDR_VIEW;
      if (id === 'cosmic-web-density') return DENSITY_VIEW;
      if (id === 'foreground:0') return FG_VIEW;
      if (id === 'sky-cubemap') return SKY_CUBEMAP_VIEW;
      throw new Error(`mock renderTargets: no view for '${id}'`);
    },
    layerViewOf: (id: string, face: number) => {
      const view = id === 'sky-cubemap' ? SKY_CUBEMAP_FACE_VIEWS[face] : undefined;
      if (!view) throw new Error(`mock renderTargets: no layer view for '${id}' layer ${face}`);
      return view;
    },
    depthViewOf: (id: string) => {
      if (id === 'foreground:0') return FG_DEPTH_VIEW;
      throw new Error(`mock renderTargets: no depth view for '${id}'`);
    },
    // Fallback for a sampling step whose source row nothing has cleared yet —
    // the 1×1 far-cleared placeholder `SampledDepth.view` carries with `row: null`.
    farDepthView: vi.fn(() => FAR_VIEW),
  };
  return {
    id: 'canvas',
    snapshot: {
      renderTargets,
      // Frame-wide: which targets hold this frame's content, unioned into by
      // `executeFrame` as it opens each ordinary render step — a fresh empty
      // Set per frame, mirroring `frameContext.ts`. Distinct from the
      // executor's own per-call `touched`, which this fixture never sees.
      renderedTargets: new Set<string>(),
    } as unknown as FrameView['snapshot'],
    slabs: [slab, slab],
    canvasSize: { width: 100, height: 50 },
    drawCamPos: [0, 0, 0] as Readonly<[number, number, number]>,
  } as unknown as FrameView;
}

/**
 * `makeCtx()` plus body-slab rows appended at indices 2, 3, … — matching
 * `deriveSlabs`' real layout (NEAR0, COSMO, then body rows). Built with
 * `makeSlab` overrides per the fixture convention, rather than a hand
 * literal, so a future `Slab` field addition is one edit in the fixture.
 */
function makeBodyCtx(bodyIds: readonly string[]): FrameView {
  const base = makeCtx();
  const bodySlabs: Slab[] = bodyIds.map((bodyId, i) =>
    makeSlab({ index: i + 2, frame: { kind: 'body-m', hostId: bodyId as BodyId } }),
  );
  return { ...base, slabs: [...base.slabs, ...bodySlabs] };
}

type StateInit = {
  disabledPasses?: Record<string, boolean>;
  compositor?: { draw: ReturnType<typeof vi.fn> };
  /** The probe row's subject this frame, and the renderer holding its probe. */
  probe?: { subject: string; probeOf: (id: string) => unknown };
};

function makeState(init: StateInit = {}): EngineState {
  return {
    settings: {
      debug: { disabledPasses: init.disabledPasses ?? {} },
    },
    gpu: {
      compositor: init.compositor ?? { draw: vi.fn() },
      meshBodyRenderer: init.probe ? { probeOf: init.probe.probeOf } : null,
    },
    computes: [],
    cubemapCaptures: { probe: { subject: init.probe?.subject ?? null } },
  } as unknown as EngineState;
}

// ── Arg assembly ─────────────────────────────────────────────────────────────

function makeArgs(over: {
  program: readonly FrameStep[];
  strategy?: RenderStrategy;
  timing?: GpuTimingService;
  state?: EngineState;
  env?: ReturnType<typeof makeEncoderEnv>;
  ctx?: FrameView;
  /** The `sgrAStar` row's faces, body-less — wrapped into the keyed `captureContexts`. */
  faceContexts?: ReadonlyMap<CubeFace, FrameView>;
  /** The whole keyed map, for a row whose faces draw body rows. */
  captureContexts?: CaptureFaceContexts;
}): {
  args: ExecuteFrameArgs;
  env: ReturnType<typeof makeEncoderEnv>;
  renderTargets: FrameView['snapshot']['renderTargets'];
} {
  const env = over.env ?? makeEncoderEnv();
  const ctx = over.ctx ?? makeCtx();
  const args: ExecuteFrameArgs = {
    encoder: env.encoder,
    ctx,
    state: over.state ?? makeState(),
    program: over.program,
    strategy: over.strategy ?? 'merged',
    timing: over.timing ?? makeNoTiming(),
    swapView: SWAP_VIEW,
    renderedTargets: new Set<string>(),
    captureContexts:
      over.captureContexts ??
      (over.faceContexts &&
        new Map([
          [
            'sgrAStar',
            new Map([...over.faceContexts].map(([face, ctx]) => [face, { ctx, bodySlabs: [] }])),
          ],
        ])),
  };
  return { args, env, renderTargets: ctx.snapshot.renderTargets };
}

/** The recorded attachment of the pass a given layer.draw spy's `callIndex` call drew into. */
function attachmentOfDraw(
  env: ReturnType<typeof makeEncoderEnv>,
  contentPass: SpyPass,
  callIndex = 0,
): {
  loadOp: string;
  clearValue?: GPUColor;
  view: GPUTextureView;
} {
  const pass = contentPass.draw.mock.calls[callIndex]![0] as GPURenderPassEncoder;
  const rec = env.passes.find((p) => p.pass === pass)!;
  const att = Array.from(rec.desc.colorAttachments as Iterable<unknown>)[0] as {
    view: GPUTextureView;
    loadOp: string;
    clearValue?: GPUColor;
  };
  return att;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('executeFrame', () => {
  it('runs steps in program order into a single encoder', () => {
    const log: string[] = [];
    const hdr = makeContentPass({ name: 'a', log });
    const swap = makeContentPass({ name: 'b', log });
    const compositor = { draw: vi.fn(() => log.push('composite')) };
    const program: FrameStep[] = [
      { kind: 'render', target: 'hdr', slab: COSMO, passes: [hdr] },
      { kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone: null } },
      { kind: 'render', target: 'swap', slab: COSMO, passes: [swap] },
    ];
    const { args } = makeArgs({ program, state: makeState({ compositor }) });
    executeFrame(args);
    expect(log).toEqual(['draw:a', 'composite', 'draw:b']);
  });

  it('threads one SlabView instance per render step into every layer in the group', () => {
    const a = makeContentPass({ name: 'a' });
    const b = makeContentPass({ name: 'b' });
    const program: FrameStep[] = [{ kind: 'render', target: 'hdr', slab: COSMO, passes: [a, b] }];
    const { args } = makeArgs({ program });
    executeFrame(args);
    const viewA = a.draw.mock.calls[0]![1] as SlabView;
    const viewB = b.draw.mock.calls[0]![1] as SlabView;
    // Identity-equal: resolved once per render step, threaded into both layers.
    expect(viewA).toBe(viewB);
  });

  it('clears a target on its first pass of the frame and loads on later passes', () => {
    // Two hdr render steps against the same target: first clears (a=1), the
    // second — target already touched — loads. A density layer proves the
    // per-target clear value (a=0).
    const env = makeEncoderEnv();
    const first = makeContentPass({ name: 'first' });
    const second = makeContentPass({ name: 'second' });
    const vol = makeContentPass({ name: 'vol' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'cosmic-web-density', slab: COSMO, passes: [vol] },
      { kind: 'render', target: 'hdr', slab: COSMO, passes: [first, second] },
      { kind: 'render', target: 'hdr', slab: COSMO, passes: [first, second] },
    ];
    // Both hdr steps draw first+second, so each is called twice — once per
    // step. The first step's pass clears; the second step's pass (target
    // already touched) loads.
    const { args } = makeArgs({ program, env });
    executeFrame(args);
    // density first pass → clear, a=0
    const volAtt = attachmentOfDraw(env, vol);
    expect(volAtt.loadOp).toBe('clear');
    expect(volAtt.clearValue).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(volAtt.view).toBe(DENSITY_VIEW);
    // hdr first step (merged group of first+second) → clear, a=1
    const firstAtt = attachmentOfDraw(env, first);
    expect(firstAtt.loadOp).toBe('clear');
    expect(firstAtt.clearValue).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(firstAtt.view).toBe(HDR_VIEW);
    // The 2nd hdr render step (same layers, target already touched) loads.
    // second.draw was called twice — once per hdr step; the 2nd call's pass loads.
    const secondPass = second.draw.mock.calls[1]![0] as GPURenderPassEncoder;
    const secondRec = env.passes.find((p) => p.pass === secondPass)!;
    const secondAtt = Array.from(secondRec.desc.colorAttachments as Iterable<unknown>)[0] as {
      loadOp: string;
    };
    expect(secondAtt.loadOp).toBe('load');
  });

  it('opens no pass for a render step with no enabled layers', () => {
    const env = makeEncoderEnv();
    const off = makeContentPass({ name: 'off', enabled: false });
    const program: FrameStep[] = [{ kind: 'render', target: 'hdr', slab: COSMO, passes: [off] }];
    const { args } = makeArgs({ program, env });
    executeFrame(args);
    expect(env.beginRenderPass).not.toHaveBeenCalled();
    expect(off.draw).not.toHaveBeenCalled();
  });

  it('skips a composite step whose source target was never touched', () => {
    const draw = vi.fn();
    const program: FrameStep[] = [
      { kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone: null } },
    ];
    const { args } = makeArgs({ program, state: makeState({ compositor: { draw } }) });
    executeFrame(args);
    expect(draw).not.toHaveBeenCalled();
  });

  it('runs a composite step when the source render step drew', () => {
    const draw = vi.fn();
    const hdr = makeContentPass({ name: 'hdr' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'hdr', slab: COSMO, passes: [hdr] },
      { kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone: null } },
    ];
    const { args } = makeArgs({ program, state: makeState({ compositor: { draw } }) });
    executeFrame(args);
    expect(draw).toHaveBeenCalledTimes(1);
    // draw(pass, viewFor(source)=HDR_VIEW, blend, tone, dstFormat)
    expect(draw.mock.calls[0]![1]).toBe(HDR_VIEW);
    expect(draw.mock.calls[0]![2]).toBe('replace');
    expect(draw.mock.calls[0]![3]).toBe(null);
    // dstFormat threaded from the dest target's spec: dest 'swap' → its
    // swap-chain format, resolved from the target table (not derived from blend).
    expect(draw.mock.calls[0]![4]).toBe('bgra8unorm');
  });

  it("threads a non-swap dest's format from the target table", () => {
    // A composite whose dest is an offscreen row resolves that row's format
    // (rgba16float for foreground:0) — proving the dstFormat comes from the
    // dest spec, not a swap-only special case.
    const draw = vi.fn();
    const hdr = makeContentPass({ name: 'hdr' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'hdr', slab: COSMO, passes: [hdr] },
      {
        kind: 'composite',
        step: { source: 'hdr', dest: 'foreground:0', blend: 'over', tone: null },
      },
    ];
    const { args } = makeArgs({ program, state: makeState({ compositor: { draw } }) });
    executeFrame(args);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw.mock.calls[0]![4]).toBe('rgba16float');
  });

  it('copy step draws its source into ctx.output with replace and no tone', () => {
    const env = makeEncoderEnv();
    const draw = vi.fn();
    const outputView = { __id: 'dome-face-output-view' } as unknown as GPUTextureView;
    const hdr = makeContentPass({ name: 'hdr' });
    const ctx = { ...makeCtx(), output: outputView };
    const program: FrameStep[] = [
      { kind: 'render', target: 'hdr', slab: COSMO, passes: [hdr] },
      { kind: 'copy', source: 'hdr' },
    ];
    const { args } = makeArgs({ program, env, ctx, state: makeState({ compositor: { draw } }) });
    executeFrame(args);

    expect(draw).toHaveBeenCalledTimes(1);
    // draw(pass, viewFor(source)=HDR_VIEW, 'replace', null, specOf(source).format)
    expect(draw.mock.calls[0]![1]).toBe(HDR_VIEW);
    expect(draw.mock.calls[0]![2]).toBe('replace');
    expect(draw.mock.calls[0]![3]).toBe(null);
    expect(draw.mock.calls[0]![4]).toBe('rgba16float');

    // The copy pass's own attachment is ctx.output, cleared opaque black.
    const copyPassDesc = env.beginRenderPass.mock.calls.at(-1)![0] as GPURenderPassDescriptor;
    const attachment = Array.from(
      copyPassDesc.colorAttachments as Iterable<GPURenderPassColorAttachment>,
    )[0]!;
    expect(attachment.view).toBe(outputView);
    expect(attachment.loadOp).toBe('clear');
    expect(attachment.clearValue).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it('copy step without a view output throws', () => {
    const hdr = makeContentPass({ name: 'hdr' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'hdr', slab: COSMO, passes: [hdr] },
      { kind: 'copy', source: 'hdr' },
    ];
    // Default makeCtx() carries no `output` — the mono/canvas-view case.
    const { args } = makeArgs({ program });
    expect(() => executeFrame(args)).toThrow(/copy step has no view output/);
  });

  it('skips a copy step whose source was never touched', () => {
    const draw = vi.fn();
    const outputView = { __id: 'dome-face-output-view-2' } as unknown as GPUTextureView;
    const ctx = { ...makeCtx(), output: outputView };
    const program: FrameStep[] = [{ kind: 'copy', source: 'hdr' }];
    const { args } = makeArgs({ program, ctx, state: makeState({ compositor: { draw } }) });
    executeFrame(args);
    expect(draw).not.toHaveBeenCalled();
  });

  it('merged strategy opens exactly one pass per non-empty render step', () => {
    const env = makeEncoderEnv();
    const a = makeContentPass({ name: 'a' });
    const b = makeContentPass({ name: 'b' });
    const c = makeContentPass({ name: 'c' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'hdr', slab: COSMO, passes: [a, b, c] },
    ];
    const { args } = makeArgs({ program, strategy: 'merged', env });
    executeFrame(args);
    expect(env.beginRenderPass).toHaveBeenCalledTimes(1);
    expect(a.draw).toHaveBeenCalledTimes(1);
    expect(b.draw).toHaveBeenCalledTimes(1);
    expect(c.draw).toHaveBeenCalledTimes(1);
  });

  it('perLayerTimed opens one pass per enabled layer, each carrying descriptorFor(layer.name)', () => {
    const env = makeEncoderEnv();
    const { svc, descriptorFor } = makeTimingService();
    const a = makeContentPass({ name: 'a' });
    const b = makeContentPass({ name: 'b' });
    const program: FrameStep[] = [{ kind: 'render', target: 'hdr', slab: COSMO, passes: [a, b] }];
    const { args } = makeArgs({ program, strategy: 'perLayerTimed', timing: svc, env });
    executeFrame(args);
    expect(env.beginRenderPass).toHaveBeenCalledTimes(2);
    expect(descriptorFor).toHaveBeenCalledWith('a');
    expect(descriptorFor).toHaveBeenCalledWith('b');
    // The descriptor for layer 'a' landed on the pass 'a' drew into.
    const passA = a.draw.mock.calls[0]![0] as GPURenderPassEncoder;
    const recA = env.passes.find((p) => p.pass === passA)!;
    const twA = (recA.desc as { timestampWrites?: { querySet: { _stub: string } } })
      .timestampWrites;
    expect(twA?.querySet._stub).toBe('a');
  });

  it('perLayerTimed keys a body-row layer’s slot by its row, not just layer.name (M2 fix)', () => {
    // The regression: a `slab: 'body'` layer drawing into TWO body rows in one
    // encoder used to attach `descriptorFor(layer.name)` for BOTH passes —
    // the same two query indices, written twice, so the reported figure was
    // whichever pass resolved last. `passTimingSlotName` folds the row into
    // the slot name, so each row's pass gets its OWN descriptor.
    const env = makeEncoderEnv();
    const { svc, descriptorFor } = makeTimingService();
    const planets = makeContentPass({ name: 'planets' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'foreground:0', slab: 2, passes: [planets] },
      { kind: 'render', target: 'foreground:0', slab: 3, passes: [planets] },
    ];
    const { args } = makeArgs({
      program,
      strategy: 'perLayerTimed',
      timing: svc,
      ctx: makeBodyCtx(['mars', 'jupiter']),
      env,
    });
    executeFrame(args);
    expect(descriptorFor).toHaveBeenCalledWith('planets·BODY[0]');
    expect(descriptorFor).toHaveBeenCalledWith('planets·BODY[1]');
    expect(descriptorFor).not.toHaveBeenCalledWith('planets');
  });

  it('composite passes carry the source→dest timing descriptor', () => {
    const env = makeEncoderEnv();
    const { svc, descriptorFor } = makeTimingService();
    const hdr = makeContentPass({ name: 'hdr' });
    const draw = vi.fn();
    const program: FrameStep[] = [
      { kind: 'render', target: 'hdr', slab: COSMO, passes: [hdr] },
      { kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone: null } },
    ];
    const { args } = makeArgs({
      program,
      timing: svc,
      state: makeState({ compositor: { draw } }),
      env,
    });
    executeFrame(args);
    expect(descriptorFor).toHaveBeenCalledWith('hdr→swap');
    // The composite pass is the one the compositor drew into.
    const compositePass = draw.mock.calls[0]![0] as GPURenderPassEncoder;
    const rec = env.passes.find((p) => p.pass === compositePass)!;
    const tw = (rec.desc as { timestampWrites?: { querySet: { _stub: string } } }).timestampWrites;
    expect(tw?.querySet._stub).toBe('hdr→swap');
  });

  it('disabledPasses[name] === true hides a layer; false/absent does not', () => {
    const hidden = makeContentPass({ name: 'hidden' });
    const shownFalse = makeContentPass({ name: 'shownFalse' });
    const shownAbsent = makeContentPass({ name: 'shownAbsent' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'hdr', slab: COSMO, passes: [hidden, shownFalse, shownAbsent] },
    ];
    const { args } = makeArgs({
      program,
      state: makeState({ disabledPasses: { hidden: true, shownFalse: false } }),
    });
    executeFrame(args);
    expect(hidden.draw).not.toHaveBeenCalled();
    expect(shownFalse.draw).toHaveBeenCalledTimes(1);
    expect(shownAbsent.draw).toHaveBeenCalledTimes(1);
  });

  it("attaches a clearing depth attachment on a depth target's first pass and loads on later passes", () => {
    // Two render steps against foreground:0 (the one depth-declaring row).
    // The first pass clears depth to the far plane (1.0); the second — target
    // already touched — loads, preserving the occlusion already written.
    const env = makeEncoderEnv();
    const a = makeContentPass({ name: 'a' });
    const b = makeContentPass({ name: 'b' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'foreground:0', slab: COSMO, passes: [a, b] },
      { kind: 'render', target: 'foreground:0', slab: COSMO, passes: [a, b] },
    ];
    const { args } = makeArgs({ program, env });
    executeFrame(args);

    type DepthDesc = {
      depthStencilAttachment?: {
        view: GPUTextureView;
        depthLoadOp: string;
        depthClearValue?: number;
        depthStoreOp: string;
      };
    };
    // a.draw call 0 = first render step's pass (clear); call 1 = second (load).
    const firstPass = a.draw.mock.calls[0]![0] as GPURenderPassEncoder;
    const firstDepth = (env.passes.find((p) => p.pass === firstPass)!.desc as DepthDesc)
      .depthStencilAttachment;
    expect(firstDepth?.view).toBe(FG_DEPTH_VIEW);
    expect(firstDepth?.depthLoadOp).toBe('clear');
    expect(firstDepth?.depthClearValue).toBe(1);
    expect(firstDepth?.depthStoreOp).toBe('store');

    const secondPass = a.draw.mock.calls[1]![0] as GPURenderPassEncoder;
    const secondDepth = (env.passes.find((p) => p.pass === secondPass)!.desc as DepthDesc)
      .depthStencilAttachment;
    expect(secondDepth?.view).toBe(FG_DEPTH_VIEW);
    expect(secondDepth?.depthLoadOp).toBe('load');
  });

  /** The depth load-op of the pass a spy's `call`th draw landed in. */
  const depthOpOf = (
    env: ReturnType<typeof makeEncoderEnv>,
    spy: SpyPass,
    call = 0,
  ): string | undefined =>
    (
      env.passes.find((p) => p.pass === spy.draw.mock.calls[call]![0])!.desc as {
        depthStencilAttachment?: { depthLoadOp: string };
      }
    ).depthStencilAttachment?.depthLoadOp;

  it("a step's explicit 'clear' restarts depth on an already-touched target", () => {
    const env = makeEncoderEnv();
    const a = makeContentPass({ name: 'a' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'foreground:0', slab: COSMO, passes: [a] },
      { kind: 'render', target: 'foreground:0', slab: COSMO, depth: 'clear', passes: [a] },
    ];
    const { args } = makeArgs({ program, env });
    executeFrame(args);
    expect(depthOpOf(env, a, 1)).toBe('clear');
  });

  it("a 'load' step clears when its row's clearing step drew nothing", () => {
    // Venus's row splits around a depth sampler but its first segment is gated
    // off (no terrain) — loading would inherit Mars's depth.
    const env = makeEncoderEnv();
    const mars = makeContentPass({ name: 'mars' });
    const off = makeContentPass({ name: 'off', enabled: false });
    const after = makeContentPass({ name: 'after' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'foreground:0', slab: 2, depth: 'clear', passes: [mars] },
      { kind: 'render', target: 'foreground:0', slab: 3, depth: 'clear', passes: [off] },
      { kind: 'render', target: 'foreground:0', slab: 3, depth: 'load', passes: [after] },
    ];
    const { args } = makeArgs({ program, env, ctx: makeBodyCtx(['mars', 'venus']) });
    executeFrame(args);
    expect(depthOpOf(env, after)).toBe('clear');
  });

  it('hands a sampling step the far placeholder and row null when nothing cleared its source', () => {
    const sampler = makeContentPass({ name: 'sampler' });
    const program: FrameStep[] = [
      {
        kind: 'render',
        target: 'hdr',
        slab: NEAR0,
        depth: { sample: 'foreground:0' },
        passes: [sampler],
      },
    ];
    const { args, renderTargets } = makeArgs({ program });
    executeFrame(args);
    const view = sampler.draw.mock.calls[0]![1] as SlabView;
    expect(view.sampledDepth).toEqual({ view: renderTargets.farDepthView(), row: null });
  });

  it("hands a sampling step the source's depth and the row that last cleared it", () => {
    const mars = makeContentPass({ name: 'mars' });
    const off = makeContentPass({ name: 'off', enabled: false });
    const sampler = makeContentPass({ name: 'sampler' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'foreground:0', slab: 2, depth: 'clear', passes: [mars] },
      { kind: 'render', target: 'foreground:0', slab: 3, depth: 'clear', passes: [off] },
      {
        kind: 'render',
        target: 'foreground:0',
        slab: 3,
        depth: { sample: 'foreground:0' },
        passes: [sampler],
      },
    ];
    const ctx = makeBodyCtx(['mars', 'venus']);
    const { args, renderTargets } = makeArgs({ program, ctx });
    executeFrame(args);
    const view = sampler.draw.mock.calls[0]![1] as SlabView;
    expect(view.sampledDepth!.view).toBe(renderTargets.depthViewOf('foreground:0'));
    expect(view.sampledDepth!.row).toBe(ctx.slabs[2]); // Mars's row, not the sampler's own
  });

  it('opens a sampling step with no depth attachment even on a depth-bearing target', () => {
    const env = makeEncoderEnv();
    const sampler = makeContentPass({ name: 'sampler' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'foreground:0', slab: COSMO, passes: [sampler] },
      {
        kind: 'render',
        target: 'foreground:0',
        slab: COSMO,
        depth: { sample: 'foreground:0' },
        passes: [sampler],
      },
    ];
    const { args } = makeArgs({ program, env });
    executeFrame(args);
    expect('depthStencilAttachment' in env.passes[1]!.desc).toBe(false);
  });

  it('opens no depthStencilAttachment for depthless targets', () => {
    const env = makeEncoderEnv();
    const hdr = makeContentPass({ name: 'hdr' });
    const swap = makeContentPass({ name: 'swap' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'hdr', slab: COSMO, passes: [hdr] },
      { kind: 'render', target: 'swap', slab: COSMO, passes: [swap] },
    ];
    const { args } = makeArgs({ program, env });
    executeFrame(args);
    // hdr and swap declare `depth: null` → no depth attachment key at all.
    for (const rec of env.passes) {
      expect('depthStencilAttachment' in rec.desc).toBe(false);
    }
  });

  // ── body-slab steps ────────────────────────────────────────────────────
  //
  // The foreground line expands to one step per body row in `deriveSlabs`'
  // painter chain, each drawing the same roster against its OWN row.

  it('resolves each body-slab step against its own row', () => {
    const contentPass = makeContentPass({ name: 'body-layer' });
    const ctx = makeBodyCtx(['mars', 'venus']);
    const program: FrameStep[] = [
      { kind: 'render', target: 'foreground:0', slab: 2, passes: [contentPass] },
      { kind: 'render', target: 'foreground:0', slab: 3, passes: [contentPass] },
    ];
    const { args } = makeArgs({ program, ctx });
    executeFrame(args);
    expect(contentPass.draw).toHaveBeenCalledTimes(2);
    const bodyIdOf = (call: number): string => {
      const view = contentPass.draw.mock.calls[call]![1] as SlabView;
      const frame = view.slab.frame as { kind: 'body-m'; hostId: string };
      return frame.hostId;
    };
    expect(bodyIdOf(0)).toBe('mars');
    expect(bodyIdOf(1)).toBe('venus');
  });

  it("gates a 'body' layer per row", () => {
    const contentPass = makeContentPass({
      name: 'body-layer',
      enabledFor: (view) =>
        (view.slab.frame as { kind: 'body-m'; hostId: string }).hostId === 'mars',
    });
    const ctx = makeBodyCtx(['mars', 'venus']);
    const program: FrameStep[] = [
      { kind: 'render', target: 'foreground:0', slab: 2, passes: [contentPass] },
      { kind: 'render', target: 'foreground:0', slab: 3, passes: [contentPass] },
    ];
    const { args } = makeArgs({ program, ctx });
    executeFrame(args);
    expect(contentPass.draw).toHaveBeenCalledTimes(1);
  });

  it('passes the resolved view to enabled', () => {
    // Fails if a future change resolves the view twice (once for the filter,
    // once for the group) instead of threading the same object through both.
    const contentPass = makeContentPass({ name: 'body-layer' });
    const ctx = makeBodyCtx(['mars']);
    const program: FrameStep[] = [
      { kind: 'render', target: 'foreground:0', slab: 2, passes: [contentPass] },
    ];
    const { args } = makeArgs({ program, ctx });
    executeFrame(args);
    const enabledView = contentPass.enabled.mock.calls[0]![2];
    const drawView = contentPass.draw.mock.calls[0]![1];
    expect(enabledView).toBe(drawView);
  });

  describe('sky-cubemap capture hand-off (Task 12)', () => {
    // A step carrying `face` must resolve its OWN camera (`enabled`/`draw`'s
    // `ctx`), not the frame-wide `args.ctx` — the runtime hand-off `renderFrame`
    // derives per scheduled face via `deriveView(faceViewSpec(...))` and threads in as
    // `faceContexts`. Two distinct fixture contexts stand in for two
    // faces' synthetic cameras; identity (`toBe`), not content, is what proves
    // routing, since a real face ctx and the frame ctx share the same shape.
    it("resolves each capture step's own face ctx, never the frame-wide ctx", () => {
      const contentPass = makeContentPass({ name: 'probe' });
      const face0Ctx = makeCtx();
      const face1Ctx = makeCtx();
      const program: FrameStep[] = [
        {
          kind: 'render',
          slab: NEAR0,
          capture: { key: 'sgrAStar', face: 0 },
          passes: [contentPass],
        },
        {
          kind: 'render',
          slab: NEAR0,
          capture: { key: 'sgrAStar', face: 1 },
          passes: [contentPass],
        },
      ];
      const faceContexts = new Map<CubeFace, FrameView>([
        [0, face0Ctx],
        [1, face1Ctx],
      ]);
      const { args } = makeArgs({ program, faceContexts });
      executeFrame(args);

      expect(contentPass.enabled).toHaveBeenCalledTimes(2);
      expect(contentPass.draw).toHaveBeenCalledTimes(2);
      expect(contentPass.enabled.mock.calls[0]![1]).toBe(face0Ctx);
      expect(contentPass.draw.mock.calls[0]![2]).toBe(face0Ctx);
      expect(contentPass.enabled.mock.calls[1]![1]).toBe(face1Ctx);
      expect(contentPass.draw.mock.calls[1]![2]).toBe(face1Ctx);
      // Neither call reached for the frame-wide ctx — the whole point of the
      // per-step override.
      expect(contentPass.draw.mock.calls[0]![2]).not.toBe(args.ctx);
      expect(contentPass.draw.mock.calls[1]![2]).not.toBe(args.ctx);
    });

    it('skips a capture step cleanly when its face has no context (the row was not ready to bake)', () => {
      const contentPass = makeContentPass({ name: 'probe' });
      const program: FrameStep[] = [
        {
          kind: 'render',
          slab: NEAR0,
          capture: { key: 'sgrAStar', face: 2 },
          passes: [contentPass],
        },
      ];
      // Map has no entry for face 2 — mirrors renderFrame omitting a face whose
      // the row's bake was skipped (pre-bootstrap frame).
      const { args } = makeArgs({ program, faceContexts: new Map() });
      expect(() => executeFrame(args)).not.toThrow();
      expect(contentPass.enabled).not.toHaveBeenCalled();
      expect(contentPass.draw).not.toHaveBeenCalled();
    });

    it('an ordinary (non-face) render step is unaffected by an absent faceContexts map', () => {
      const contentPass = makeContentPass({ name: 'a' });
      const program: FrameStep[] = [
        { kind: 'render', target: 'hdr', slab: COSMO, passes: [contentPass] },
      ];
      const { args } = makeArgs({ program });
      executeFrame(args);
      expect(contentPass.draw.mock.calls[0]![2]).toBe(args.ctx);
    });

    it("resolves each capture face through the capture row's target layer view, never viewOf", () => {
      // The step names only its capture key: the row it names owns the texture,
      // and the face is one of its array layers. `viewOf`'s multi-layer view is
      // the failure mode — WebGPU rejects it as a colour attachment, and taking
      // it for all six faces would write one layer six times.
      const contentPass = makeContentPass({ name: 'probe' });
      const program: FrameStep[] = [0, 1, 2, 3, 4, 5].map(
        (face): FrameStep => ({
          kind: 'render',
          slab: NEAR0,
          capture: { key: 'sgrAStar', face: face as CubeFace },
          passes: [contentPass],
        }),
      );
      const faceCtx = makeCtx();
      const faceContexts = new Map<CubeFace, FrameView>(
        [0, 1, 2, 3, 4, 5].map((face) => [face as CubeFace, faceCtx]),
      );
      const { args, env } = makeArgs({ program, faceContexts });
      executeFrame(args);

      expect(contentPass.draw).toHaveBeenCalledTimes(6);
      const viewsPerFace = [0, 1, 2, 3, 4, 5].map(
        (face) => attachmentOfDraw(env, contentPass, face).view,
      );
      for (const view of viewsPerFace) expect(view).not.toBe(SKY_CUBEMAP_VIEW);
      expect(new Set(viewsPerFace).size).toBe(6);
      // The mock answers `layerViewOf` for 'sky-cubemap' alone, so matching it
      // face-for-face is what pins the key→row→target resolution.
      expect(viewsPerFace).toEqual(SKY_CUBEMAP_FACE_VIEWS);
    });

    it("the SECOND capture step for the SAME face loads — it must not wipe the first slab's draws", () => {
      // Pins the real bug: the capture line expands to TWO steps per face
      // (COSMO then NEAR0) because the roster spans both slabs. A blanket
      // always-clear made the NEAR0 step clear the face the COSMO step had just
      // drawn the galaxy points and textured disks into, so no COSMO content
      // ever survived into the cubemap the lens samples.
      const cosmoPass = makeContentPass({ name: 'textured-disks' });
      const near0Pass = makeContentPass({ name: 'star-points' });
      const program: FrameStep[] = [
        {
          kind: 'render',
          slab: COSMO,
          capture: { key: 'sgrAStar', face: 0 },
          passes: [cosmoPass],
        },
        {
          kind: 'render',
          slab: NEAR0,
          capture: { key: 'sgrAStar', face: 0 },
          passes: [near0Pass],
        },
      ];
      const faceCtx = makeCtx();
      const { args, env } = makeArgs({
        program,
        faceContexts: new Map([[0, faceCtx]]),
      });
      executeFrame(args);

      expect(attachmentOfDraw(env, cosmoPass).loadOp).toBe('clear');
      expect(attachmentOfDraw(env, near0Pass).loadOp).toBe('load');
    });

    it('two capture steps for different faces in ONE frame BOTH clear — one face never loads another face', () => {
      // Pins the real bug: `touched` tracks by TARGET ('sky-cubemap'), not by
      // LAYER (face). Before the fix, face 0's pass cleared and marked
      // 'sky-cubemap' touched; face 1's pass then LOADED — against its own
      // stale prior-frame content, not face 0's — and stars drew additively
      // over it, flickering the cubemap bright/dim by capture order.
      const contentPass = makeContentPass({ name: 'probe' });
      const program: FrameStep[] = [
        {
          kind: 'render',
          slab: NEAR0,
          capture: { key: 'sgrAStar', face: 0 },
          passes: [contentPass],
        },
        {
          kind: 'render',
          slab: NEAR0,
          capture: { key: 'sgrAStar', face: 1 },
          passes: [contentPass],
        },
      ];
      const faceCtx = makeCtx();
      const faceContexts = new Map<CubeFace, FrameView>([
        [0, faceCtx],
        [1, faceCtx],
      ]);
      const { args, env } = makeArgs({ program, faceContexts });
      executeFrame(args);

      expect(attachmentOfDraw(env, contentPass, 0).loadOp).toBe('clear');
      expect(attachmentOfDraw(env, contentPass, 1).loadOp).toBe('clear');
    });

    it("attaches the capture row's depth on a body-slab capture step and none on its COSMO step", () => {
      // A probe face draws the sky (COSMO, depthless) and then its subject's
      // host body on that body's row — the one step that needs the probe's
      // own depth, cleared, so the host occludes the sky behind it and nothing
      // a previous face wrote leaks in.
      const PROBE_FACE_VIEW = { __id: 'probe-face-view' } as unknown as GPUTextureView;
      const PROBE_DEPTH_VIEW = { __id: 'probe-depth-view' } as unknown as GPUTextureView;
      const cube = { createView: vi.fn(() => PROBE_FACE_VIEW) };
      const depth = { createView: vi.fn(() => PROBE_DEPTH_VIEW) };
      const probeOf = vi.fn((id: string) => (id === 'voyager-1' ? { cube, depth } : null));
      const sky = makeContentPass({ name: 'sky' });
      const mesh = makeContentPass({ name: 'mesh' });
      const program: FrameStep[] = [
        { kind: 'render', slab: COSMO, capture: { key: 'probe', face: 2 }, passes: [sky] },
        {
          kind: 'render',
          slab: 2,
          capture: { key: 'probe', face: 2 },
          depth: 'clear',
          passes: [mesh],
        },
      ];
      const faceCtx = makeBodyCtx(['earth']);
      const { args, env } = makeArgs({
        program,
        state: makeState({ probe: { subject: 'voyager-1', probeOf } }),
        captureContexts: new Map([['probe', new Map([[2, { ctx: faceCtx, bodySlabs: [2] }]])]]),
      });
      executeFrame(args);

      type DepthDesc = {
        depthStencilAttachment?: { view: GPUTextureView; depthLoadOp: string };
      };
      const descOf = (pass: SpyPass): DepthDesc =>
        env.passes.find((p) => p.pass === pass.draw.mock.calls[0]![0])!.desc as DepthDesc;
      expect('depthStencilAttachment' in descOf(sky)).toBe(false);
      expect(descOf(mesh).depthStencilAttachment).toMatchObject({
        view: PROBE_DEPTH_VIEW,
        depthLoadOp: 'clear',
      });
      // Both steps write the same face of the subject's cube — mip 0, one layer.
      expect(attachmentOfDraw(env, sky).view).toBe(PROBE_FACE_VIEW);
      expect(attachmentOfDraw(env, mesh).view).toBe(PROBE_FACE_VIEW);
      expect(cube.createView).toHaveBeenCalledWith(
        expect.objectContaining({ baseMipLevel: 0, mipLevelCount: 1, baseArrayLayer: 2 }),
      );
      expect(attachmentOfDraw(env, mesh).loadOp).toBe('load');
    });
  });
});
