/**
 * executeFrame — unit tests for the strategy-parameterized frame executor.
 *
 * The executor walks a `FrameStep[]` program into one command encoder,
 * selecting each render step's layer group by `(target, slab)` + gate,
 * dispatching composites through the Compositor, and running compute steps
 * through the module-internal COMPUTE table. We mock the encoder, the render
 * passes, the compositor, and the content layers (object literals with spy
 * `enabled`/`draw`), so the whole thing runs without a real WebGPU device.
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
import type { ContentLayer } from '../../../../src/@types/engine/frame/ContentLayer';
import type { RenderStrategy } from '../../../../src/@types/engine/frame/RenderStrategy';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { GpuTimingService } from '../../../../src/@types/gpu/timing/GpuTimingService';
import type { TimingSlotName } from '../../../../src/@types/gpu/timing/TimingSlotName';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { CubeFace } from '../../../../src/@types/rendering/CubeFace';

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

type SpyLayer = ContentLayer & {
  enabled: ReturnType<typeof vi.fn<ContentLayer['enabled']>>;
  draw: ReturnType<typeof vi.fn<ContentLayer['draw']>>;
};

function makeLayer(init: {
  name: string;
  target: string;
  slab?: number | 'body';
  enabled?: boolean;
  // Per-row gate for a 'body' layer: reads the resolved view (e.g. its
  // `slab.frame.bodyId`) instead of the constant `enabled` flag above.
  enabledFor?: (view: SlabView) => boolean;
  log?: string[];
  // Ruling 6: opts this fixture layer into the sky-cubemap capture roster —
  // see `ContentLayer.skyCapture`'s doc.
  skyCapture?: true;
  // Task 14b (Ruling 9): opts this fixture layer into the black-hole lens's
  // 'post' step split half — see `ContentLayer.hdrPostLensing`'s doc.
  hdrPostLensing?: true;
}): SpyLayer {
  return {
    name: init.name,
    slab: init.slab ?? COSMO,
    target: init.target,
    blend: 'additive',
    ...(init.skyCapture ? { skyCapture: true as const } : {}),
    ...(init.hdrPostLensing ? { hdrPostLensing: true as const } : {}),
    enabled: vi.fn<ContentLayer['enabled']>((_state, _ctx, view) =>
      init.enabledFor ? init.enabledFor(view) : (init.enabled ?? true),
    ),
    draw: vi.fn<ContentLayer['draw']>(() => {
      init.log?.push(`draw:${init.name}`);
    }),
  };
}

// ── Fake ctx / state ─────────────────────────────────────────────────────────

const HDR_VIEW = { __id: 'hdr-view' } as unknown as GPUTextureView;
const VOLUME_VIEW = { __id: 'volume-view' } as unknown as GPUTextureView;
const FG_VIEW = { __id: 'foreground-view' } as unknown as GPUTextureView;
const FG_DEPTH_VIEW = { __id: 'foreground-depth-view' } as unknown as GPUTextureView;
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
    id: 'volume',
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

function makeCtx(): ReadyFrameContext {
  const slab: Slab = makeCosmoSlab();
  return {
    slabs: [slab, slab],
    canvasSize: { width: 100, height: 50 },
    drawCamPos: [0, 0, 0] as Readonly<[number, number, number]>,
    // The executor uses this as its first-touch `touched` set (the same object
    // it exposes to layers as `renderedTargets`): a fresh empty Set per frame,
    // populated as passes open. Mirrors `deriveFrameContext`.
    renderedTargets: new Set<string>(),
    // Offscreen view resolution goes through the target table's viewOf —
    // the executor's viewFor keeps only the swap-vs-offscreen branch. `specs`
    // + `depthViewOf` let the executor discover which target rows declare a
    // depth attachment (only `foreground:0` here). `specOf` is what
    // `colorAttachment`/`depthAttachment`/the composite's dstFormat read —
    // clear values here match production (`hdr`/`swap` at a=1, the rest
    // a=0) so a clear-value regression would show up in the clear/load
    // assertions below.
    renderTargets: {
      specs: EXEC_SPECS,
      specOf: (id: string) => {
        const spec = EXEC_SPECS.find((s) => s.id === id);
        if (!spec) throw new Error(`mock renderTargets: no spec row for '${id}'`);
        return spec;
      },
      viewOf: (id: string) => {
        if (id === 'hdr') return HDR_VIEW;
        if (id === 'volume') return VOLUME_VIEW;
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
    },
  } as unknown as ReadyFrameContext;
}

/**
 * `makeCtx()` plus body-slab rows appended at indices 2, 3, … — matching
 * `deriveSlabs`' real layout (NEAR0, COSMO, then body rows). Built with
 * `makeSlab` overrides per the fixture convention, rather than a hand
 * literal, so a future `Slab` field addition is one edit in the fixture.
 */
function makeBodyCtx(bodyIds: readonly string[]): ReadyFrameContext {
  const base = makeCtx();
  const bodySlabs: Slab[] = bodyIds.map((bodyId, i) =>
    makeSlab({ index: i + 2, frame: { kind: 'body-m', bodyId: bodyId as BodyId } }),
  );
  return { ...base, slabs: [...base.slabs, ...bodySlabs] };
}

type StateInit = {
  disabledPasses?: Record<string, boolean>;
  compositor?: { draw: ReturnType<typeof vi.fn> };
  flowFieldRenderer?: unknown;
  flowEnabled?: boolean;
  flowSlot?: unknown;
};

function makeState(init: StateInit = {}): EngineState {
  return {
    settings: {
      debug: { disabledPasses: init.disabledPasses ?? {} },
      flow: { enabled: init.flowEnabled ?? false },
    },
    gpu: {
      compositor: init.compositor ?? { draw: vi.fn() },
      flowFieldRenderer: init.flowFieldRenderer ?? null,
    },
    assetSlots: { flow: init.flowSlot ?? null },
  } as unknown as EngineState;
}

// ── Arg assembly ─────────────────────────────────────────────────────────────

function makeArgs(over: {
  program: readonly FrameStep[];
  layers: readonly ContentLayer[];
  strategy?: RenderStrategy;
  timing?: GpuTimingService;
  state?: EngineState;
  env?: ReturnType<typeof makeEncoderEnv>;
  ctx?: ReadyFrameContext;
  skyCubemapFaceContexts?: ReadonlyMap<CubeFace, ReadyFrameContext>;
}): { args: ExecuteFrameArgs; env: ReturnType<typeof makeEncoderEnv> } {
  const env = over.env ?? makeEncoderEnv();
  const args: ExecuteFrameArgs = {
    encoder: env.encoder,
    ctx: over.ctx ?? makeCtx(),
    state: over.state ?? makeState(),
    program: over.program,
    layers: over.layers,
    strategy: over.strategy ?? 'merged',
    timing: over.timing ?? makeNoTiming(),
    swapView: SWAP_VIEW,
    skyCubemapFaceContexts: over.skyCubemapFaceContexts,
  };
  return { args, env };
}

/** The recorded attachment of the pass a given layer.draw spy's `callIndex` call drew into. */
function attachmentOfDraw(
  env: ReturnType<typeof makeEncoderEnv>,
  layer: SpyLayer,
  callIndex = 0,
): {
  loadOp: string;
  clearValue?: GPUColor;
  view: GPUTextureView;
} {
  const pass = layer.draw.mock.calls[callIndex]![0] as GPURenderPassEncoder;
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
    const hdr = makeLayer({ name: 'a', target: 'hdr', log });
    const swap = makeLayer({ name: 'b', target: 'swap', log });
    const compositor = { draw: vi.fn(() => log.push('composite')) };
    const program: FrameStep[] = [
      { kind: 'render', target: 'hdr', slab: COSMO },
      { kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone: null } },
      { kind: 'render', target: 'swap', slab: COSMO },
    ];
    const { args } = makeArgs({
      program,
      layers: [hdr, swap],
      state: makeState({ compositor }),
    });
    executeFrame(args);
    expect(log).toEqual(['draw:a', 'composite', 'draw:b']);
  });

  it('selects layers by (target, slab): two render steps over the same registry draw disjoint groups', () => {
    const hdrA = makeLayer({ name: 'hdrA', target: 'hdr' });
    const hdrB = makeLayer({ name: 'hdrB', target: 'hdr' });
    const swapA = makeLayer({ name: 'swapA', target: 'swap' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'hdr', slab: COSMO },
      { kind: 'render', target: 'swap', slab: COSMO },
    ];
    const { args } = makeArgs({ program, layers: [hdrA, swapA, hdrB] });
    executeFrame(args);
    expect(hdrA.draw).toHaveBeenCalledTimes(1);
    expect(hdrB.draw).toHaveBeenCalledTimes(1);
    expect(swapA.draw).toHaveBeenCalledTimes(1);
    // hdr layers drew into the hdr target's view; swap layer into the swap view.
    expect(hdrA.draw.mock.calls[0]![1] as SlabView).toBeDefined();
    const hdrPass = hdrA.draw.mock.calls[0]![0];
    const swapPass = swapA.draw.mock.calls[0]![0];
    expect(hdrPass).not.toBe(swapPass);
  });

  it('threads one SlabView instance per render step into every layer in the group', () => {
    const a = makeLayer({ name: 'a', target: 'hdr' });
    const b = makeLayer({ name: 'b', target: 'hdr' });
    const program: FrameStep[] = [{ kind: 'render', target: 'hdr', slab: COSMO }];
    const { args } = makeArgs({ program, layers: [a, b] });
    executeFrame(args);
    const viewA = a.draw.mock.calls[0]![1] as SlabView;
    const viewB = b.draw.mock.calls[0]![1] as SlabView;
    // Identity-equal: resolved once per render step, threaded into both layers.
    expect(viewA).toBe(viewB);
  });

  it('clears a target on its first pass of the frame and loads on later passes', () => {
    // Two hdr render steps against the same target: first clears (a=1), the
    // second — target already touched — loads. A volume layer proves the
    // per-target clear value (a=0).
    const env = makeEncoderEnv();
    const first = makeLayer({ name: 'first', target: 'hdr' });
    const second = makeLayer({ name: 'second', target: 'hdr' });
    const vol = makeLayer({ name: 'vol', target: 'volume' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'volume', slab: COSMO },
      { kind: 'render', target: 'hdr', slab: COSMO },
      { kind: 'render', target: 'hdr', slab: COSMO },
    ];
    // Both hdr steps select the same (target, slab) group, so first+second
    // draw twice — once per step. The first step's pass clears; the second
    // step's pass (target already touched) loads.
    const { args } = makeArgs({
      program,
      layers: [vol, first, second],
      env,
    });
    executeFrame(args);
    // volume first pass → clear, a=0
    const volAtt = attachmentOfDraw(env, vol);
    expect(volAtt.loadOp).toBe('clear');
    expect(volAtt.clearValue).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(volAtt.view).toBe(VOLUME_VIEW);
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
    const off = makeLayer({ name: 'off', target: 'hdr', enabled: false });
    const program: FrameStep[] = [{ kind: 'render', target: 'hdr', slab: COSMO }];
    const { args } = makeArgs({ program, layers: [off], env });
    executeFrame(args);
    expect(env.beginRenderPass).not.toHaveBeenCalled();
    expect(off.draw).not.toHaveBeenCalled();
  });

  it('skips a composite step whose source target was never touched', () => {
    const draw = vi.fn();
    const program: FrameStep[] = [
      { kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone: null } },
    ];
    const { args } = makeArgs({
      program,
      layers: [],
      state: makeState({ compositor: { draw } }),
    });
    executeFrame(args);
    expect(draw).not.toHaveBeenCalled();
  });

  it('runs a composite step when the source render step drew', () => {
    const draw = vi.fn();
    const hdr = makeLayer({ name: 'hdr', target: 'hdr' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'hdr', slab: COSMO },
      { kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone: null } },
    ];
    const { args } = makeArgs({
      program,
      layers: [hdr],
      state: makeState({ compositor: { draw } }),
    });
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
    const hdr = makeLayer({ name: 'hdr', target: 'hdr' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'hdr', slab: COSMO },
      {
        kind: 'composite',
        step: { source: 'hdr', dest: 'foreground:0', blend: 'over', tone: null },
      },
    ];
    const { args } = makeArgs({
      program,
      layers: [hdr],
      state: makeState({ compositor: { draw } }),
    });
    executeFrame(args);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw.mock.calls[0]![4]).toBe('rgba16float');
  });

  it('merged strategy opens exactly one pass per non-empty render step', () => {
    const env = makeEncoderEnv();
    const a = makeLayer({ name: 'a', target: 'hdr' });
    const b = makeLayer({ name: 'b', target: 'hdr' });
    const c = makeLayer({ name: 'c', target: 'hdr' });
    const program: FrameStep[] = [{ kind: 'render', target: 'hdr', slab: COSMO }];
    const { args } = makeArgs({ program, layers: [a, b, c], strategy: 'merged', env });
    executeFrame(args);
    expect(env.beginRenderPass).toHaveBeenCalledTimes(1);
    expect(a.draw).toHaveBeenCalledTimes(1);
    expect(b.draw).toHaveBeenCalledTimes(1);
    expect(c.draw).toHaveBeenCalledTimes(1);
  });

  it('perLayerTimed opens one pass per enabled layer, each carrying descriptorFor(layer.name)', () => {
    const env = makeEncoderEnv();
    const { svc, descriptorFor } = makeTimingService();
    const a = makeLayer({ name: 'a', target: 'hdr' });
    const b = makeLayer({ name: 'b', target: 'hdr' });
    const program: FrameStep[] = [{ kind: 'render', target: 'hdr', slab: COSMO }];
    const { args } = makeArgs({
      program,
      layers: [a, b],
      strategy: 'perLayerTimed',
      timing: svc,
      env,
    });
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
    // whichever pass resolved last. `layerTimingSlotName` folds the row into
    // the slot name, so each row's pass gets its OWN descriptor.
    const env = makeEncoderEnv();
    const { svc, descriptorFor } = makeTimingService();
    const planets = makeLayer({ name: 'planets', target: 'foreground:0', slab: 'body' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'foreground:0', slab: 2 },
      { kind: 'render', target: 'foreground:0', slab: 3 },
    ];
    const { args } = makeArgs({
      program,
      layers: [planets],
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
    const hdr = makeLayer({ name: 'hdr', target: 'hdr' });
    const draw = vi.fn();
    const program: FrameStep[] = [
      { kind: 'render', target: 'hdr', slab: COSMO },
      { kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone: null } },
    ];
    const { args } = makeArgs({
      program,
      layers: [hdr],
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
    const hidden = makeLayer({ name: 'hidden', target: 'hdr' });
    const shownFalse = makeLayer({ name: 'shownFalse', target: 'hdr' });
    const shownAbsent = makeLayer({ name: 'shownAbsent', target: 'hdr' });
    const program: FrameStep[] = [{ kind: 'render', target: 'hdr', slab: COSMO }];
    const { args } = makeArgs({
      program,
      layers: [hidden, shownFalse, shownAbsent],
      state: makeState({ disabledPasses: { hidden: true, shownFalse: false } }),
    });
    executeFrame(args);
    expect(hidden.draw).not.toHaveBeenCalled();
    expect(shownFalse.draw).toHaveBeenCalledTimes(1);
    expect(shownAbsent.draw).toHaveBeenCalledTimes(1);
  });

  it('compute steps dispatch through the COMPUTE table (flow → flowFieldRenderer.encodeCompute)', () => {
    const encodeCompute = vi.fn();
    const flowFieldRenderer = {
      label: 'flowFieldRenderer',
      encodeCompute,
    };
    const flowSlot = { state: () => ({ kind: 'ready' }) };
    const program: FrameStep[] = [{ kind: 'compute', name: 'flow' }];
    const { args } = makeArgs({
      program,
      layers: [],
      state: makeState({ flowFieldRenderer, flowEnabled: true, flowSlot }),
    });
    executeFrame(args);
    expect(encodeCompute).toHaveBeenCalledTimes(1);
    expect(encodeCompute.mock.calls[0]![0]).toBe(args.encoder);
  });

  it("attaches a clearing depth attachment on a depth target's first pass and loads on later passes", () => {
    // Two render steps against foreground:0 (the one depth-declaring row).
    // The first pass clears depth to the far plane (1.0); the second — target
    // already touched — loads, preserving the occlusion already written.
    const env = makeEncoderEnv();
    const a = makeLayer({ name: 'a', target: 'foreground:0' });
    const b = makeLayer({ name: 'b', target: 'foreground:0' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'foreground:0', slab: COSMO },
      { kind: 'render', target: 'foreground:0', slab: COSMO },
    ];
    const { args } = makeArgs({ program, layers: [a, b], env });
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

  it("a step's explicit depthLoad overrides the first-touch rule in both directions", () => {
    // Same two-step shape as above, but each step names its own depth op: the
    // first loads where the rule would clear, the second clears where the rule
    // would load (the restart a back-to-front slab run needs mid-frame).
    const env = makeEncoderEnv();
    const a = makeLayer({ name: 'a', target: 'foreground:0' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'foreground:0', slab: COSMO, depthLoad: 'load' },
      { kind: 'render', target: 'foreground:0', slab: COSMO, depthLoad: 'clear' },
    ];
    const { args } = makeArgs({ program, layers: [a], env });
    executeFrame(args);

    const depthOpOf = (pass: GPURenderPassEncoder): string | undefined =>
      (
        env.passes.find((p) => p.pass === pass)!.desc as {
          depthStencilAttachment?: { depthLoadOp: string };
        }
      ).depthStencilAttachment?.depthLoadOp;

    expect(depthOpOf(a.draw.mock.calls[0]![0] as GPURenderPassEncoder)).toBe('load');
    expect(depthOpOf(a.draw.mock.calls[1]![0] as GPURenderPassEncoder)).toBe('clear');
  });

  it('opens no depthStencilAttachment for depthless targets', () => {
    const env = makeEncoderEnv();
    const hdr = makeLayer({ name: 'hdr', target: 'hdr' });
    const swap = makeLayer({ name: 'swap', target: 'swap' });
    const program: FrameStep[] = [
      { kind: 'render', target: 'hdr', slab: COSMO },
      { kind: 'render', target: 'swap', slab: COSMO },
    ];
    const { args } = makeArgs({ program, layers: [hdr, swap], env });
    executeFrame(args);
    // hdr and swap declare `depth: null` → no depth attachment key at all.
    for (const rec of env.passes) {
      expect('depthStencilAttachment' in rec.desc).toBe(false);
    }
  });

  // ── 'body' slab layers ─────────────────────────────────────────────────
  //
  // A `slab: 'body'` layer matches every render step whose resolved slab is a
  // body row (`frame.kind === 'body-m'`), not one fixed index — Task 7 emits
  // one such step per body row in `deriveSlabs`' painter chain.

  it("runs a 'body' layer once per body-slab step", () => {
    const layer = makeLayer({ name: 'body-layer', target: 'foreground:0', slab: 'body' });
    const ctx = makeBodyCtx(['mars', 'venus']);
    const program: FrameStep[] = [
      { kind: 'render', target: 'foreground:0', slab: 2 },
      { kind: 'render', target: 'foreground:0', slab: 3 },
    ];
    const { args } = makeArgs({ program, layers: [layer], ctx });
    executeFrame(args);
    expect(layer.draw).toHaveBeenCalledTimes(2);
    const bodyIdOf = (call: number): string => {
      const view = layer.draw.mock.calls[call]![1] as SlabView;
      const frame = view.slab.frame as { kind: 'body-m'; bodyId: string };
      return frame.bodyId;
    };
    expect(bodyIdOf(0)).toBe('mars');
    expect(bodyIdOf(1)).toBe('venus');
  });

  it("gates a 'body' layer per row", () => {
    const layer = makeLayer({
      name: 'body-layer',
      target: 'foreground:0',
      slab: 'body',
      enabledFor: (view) =>
        (view.slab.frame as { kind: 'body-m'; bodyId: string }).bodyId === 'mars',
    });
    const ctx = makeBodyCtx(['mars', 'venus']);
    const program: FrameStep[] = [
      { kind: 'render', target: 'foreground:0', slab: 2 },
      { kind: 'render', target: 'foreground:0', slab: 3 },
    ];
    const { args } = makeArgs({ program, layers: [layer], ctx });
    executeFrame(args);
    expect(layer.draw).toHaveBeenCalledTimes(1);
  });

  it('passes the resolved view to enabled', () => {
    // Fails if a future change resolves the view twice (once for the filter,
    // once for the group) instead of threading the same object through both.
    const layer = makeLayer({ name: 'body-layer', target: 'foreground:0', slab: 'body' });
    const ctx = makeBodyCtx(['mars']);
    const program: FrameStep[] = [{ kind: 'render', target: 'foreground:0', slab: 2 }];
    const { args } = makeArgs({ program, layers: [layer], ctx });
    executeFrame(args);
    const enabledView = layer.enabled.mock.calls[0]![2];
    const drawView = layer.draw.mock.calls[0]![1];
    expect(enabledView).toBe(drawView);
  });

  it("does not match a 'body' layer against a world-mpc step", () => {
    const layer = makeLayer({ name: 'body-layer', target: 'foreground:0', slab: 'body' });
    // The default fixture ctx's NEAR0 row is `frame.kind === 'world-mpc'`
    // (makeCosmoSlab), so this step never matches a 'body' layer.
    const program: FrameStep[] = [{ kind: 'render', target: 'foreground:0', slab: NEAR0 }];
    const { args } = makeArgs({ program, layers: [layer] });
    executeFrame(args);
    expect(layer.draw).not.toHaveBeenCalled();
  });

  describe('sky-cubemap capture hand-off (Task 12)', () => {
    // A step carrying `face` must resolve its OWN camera (`enabled`/`draw`'s
    // `ctx`), not the frame-wide `args.ctx` — the runtime hand-off `renderFrame`
    // derives per scheduled face via `skyCubemapFaceContext` and threads in as
    // `skyCubemapFaceContexts`. Two distinct fixture contexts stand in for two
    // faces' synthetic cameras; identity (`toBe`), not content, is what proves
    // routing, since a real face ctx and the frame ctx share the same shape.
    it("resolves each capture step's own face ctx, never the frame-wide ctx", () => {
      const layer = makeLayer({ name: 'probe', target: 'hdr', slab: NEAR0, skyCapture: true });
      const face0Ctx = makeCtx();
      const face1Ctx = makeCtx();
      const program: FrameStep[] = [
        { kind: 'render', target: 'sky-cubemap', slab: NEAR0, face: 0 },
        { kind: 'render', target: 'sky-cubemap', slab: NEAR0, face: 1 },
      ];
      const skyCubemapFaceContexts = new Map<CubeFace, ReadyFrameContext>([
        [0, face0Ctx],
        [1, face1Ctx],
      ]);
      const { args } = makeArgs({ program, layers: [layer], skyCubemapFaceContexts });
      executeFrame(args);

      expect(layer.enabled).toHaveBeenCalledTimes(2);
      expect(layer.draw).toHaveBeenCalledTimes(2);
      expect(layer.enabled.mock.calls[0]![1]).toBe(face0Ctx);
      expect(layer.draw.mock.calls[0]![2]).toBe(face0Ctx);
      expect(layer.enabled.mock.calls[1]![1]).toBe(face1Ctx);
      expect(layer.draw.mock.calls[1]![2]).toBe(face1Ctx);
      // Neither call reached for the frame-wide ctx — the whole point of the
      // per-step override.
      expect(layer.draw.mock.calls[0]![2]).not.toBe(args.ctx);
      expect(layer.draw.mock.calls[1]![2]).not.toBe(args.ctx);
    });

    it('skips a capture step cleanly when its face has no context (skyCubemapFaceContext returned null)', () => {
      const layer = makeLayer({ name: 'probe', target: 'sky-cubemap', slab: NEAR0 });
      const program: FrameStep[] = [
        { kind: 'render', target: 'sky-cubemap', slab: NEAR0, face: 2 },
      ];
      // Map has no entry for face 2 — mirrors renderFrame omitting a face whose
      // skyCubemapFaceContext call returned null (pre-bootstrap frame).
      const { args } = makeArgs({
        program,
        layers: [layer],
        skyCubemapFaceContexts: new Map(),
      });
      expect(() => executeFrame(args)).not.toThrow();
      expect(layer.enabled).not.toHaveBeenCalled();
      expect(layer.draw).not.toHaveBeenCalled();
    });

    it('an ordinary (non-face) render step is unaffected by an absent skyCubemapFaceContexts map', () => {
      const layer = makeLayer({ name: 'a', target: 'hdr' });
      const program: FrameStep[] = [{ kind: 'render', target: 'hdr', slab: COSMO }];
      const { args } = makeArgs({ program, layers: [layer] });
      executeFrame(args);
      expect(layer.draw.mock.calls[0]![2]).toBe(args.ctx);
    });

    // Ruling 6: capture steps select by `skyCapture`, not `target` — the
    // whole point being that a roster layer keeps its ordinary `target`
    // ('hdr') for its normal per-frame draw and is ALSO reachable from a
    // capture step via the flag alone.
    it("selects a capture step group by the skyCapture flag, ignoring the layer's own target", () => {
      const layer = makeLayer({ name: 'roster', target: 'hdr', slab: NEAR0, skyCapture: true });
      const program: FrameStep[] = [
        { kind: 'render', target: 'sky-cubemap', slab: NEAR0, face: 3 },
      ];
      const faceCtx = makeCtx();
      const { args, env } = makeArgs({
        program,
        layers: [layer],
        skyCubemapFaceContexts: new Map([[3, faceCtx]]),
      });
      executeFrame(args);
      expect(layer.draw).toHaveBeenCalledTimes(1);
      // The pass it drew into is face 3's OWN sky-cubemap layer view, not
      // 'hdr' and not the shared whole-array `viewOf('sky-cubemap')` — the
      // step's `(target, face)` wins for the PASS, regardless of the layer's
      // own `target` field (which only gated selection above).
      expect(attachmentOfDraw(env, layer).view).toBe(SKY_CUBEMAP_FACE_VIEWS[3]);
      expect(attachmentOfDraw(env, layer).view).not.toBe(SKY_CUBEMAP_VIEW);
    });

    it('resolves EACH capture face to its OWN colour-attachment view, distinct per face and from viewOf', () => {
      // Pins the real bug: before the fix, every capture step resolved the
      // same multi-layer `viewOf('sky-cubemap')` regardless of `step.face`,
      // so all 6 faces wrote the same texture layer.
      const layer = makeLayer({ name: 'probe', target: 'hdr', slab: NEAR0, skyCapture: true });
      const program: FrameStep[] = [0, 1, 2, 3, 4, 5].map(
        (face): FrameStep => ({
          kind: 'render',
          target: 'sky-cubemap',
          slab: NEAR0,
          face: face as CubeFace,
        }),
      );
      const faceCtx = makeCtx();
      const skyCubemapFaceContexts = new Map<CubeFace, ReadyFrameContext>(
        [0, 1, 2, 3, 4, 5].map((face) => [face as CubeFace, faceCtx]),
      );
      const { args, env } = makeArgs({ program, layers: [layer], skyCubemapFaceContexts });
      executeFrame(args);

      expect(layer.draw).toHaveBeenCalledTimes(6);
      const viewsPerFace = [0, 1, 2, 3, 4, 5].map(
        (face) => attachmentOfDraw(env, layer, face).view,
      );
      for (const view of viewsPerFace) expect(view).not.toBe(SKY_CUBEMAP_VIEW);
      expect(new Set(viewsPerFace).size).toBe(6);
    });

    it("the SECOND capture step for the SAME face loads — it must not wipe the first slab's draws", () => {
      // Pins the real bug: `frameProgram` emits TWO steps per face (COSMO then
      // NEAR0) because the roster spans both slabs. A blanket always-clear made
      // the NEAR0 step clear the face the COSMO step had just drawn the galaxy
      // points and textured disks into, so no COSMO content ever survived into
      // the cubemap the lens samples.
      const cosmoLayer = makeLayer({
        name: 'textured-disks',
        target: 'hdr',
        slab: COSMO,
        skyCapture: true,
      });
      const near0Layer = makeLayer({
        name: 'star-points',
        target: 'hdr',
        slab: NEAR0,
        skyCapture: true,
      });
      const program: FrameStep[] = [
        { kind: 'render', target: 'sky-cubemap', slab: COSMO, face: 0 },
        { kind: 'render', target: 'sky-cubemap', slab: NEAR0, face: 0 },
      ];
      const faceCtx = makeCtx();
      const { args, env } = makeArgs({
        program,
        layers: [cosmoLayer, near0Layer],
        skyCubemapFaceContexts: new Map([[0, faceCtx]]),
      });
      executeFrame(args);

      expect(attachmentOfDraw(env, cosmoLayer).loadOp).toBe('clear');
      expect(attachmentOfDraw(env, near0Layer).loadOp).toBe('load');
    });

    it('two capture steps for different faces in ONE frame BOTH clear — one face never loads another face', () => {
      // Pins the real bug: `touched` tracks by TARGET ('sky-cubemap'), not by
      // LAYER (face). Before the fix, face 0's pass cleared and marked
      // 'sky-cubemap' touched; face 1's pass then LOADED — against its own
      // stale prior-frame content, not face 0's — and stars drew additively
      // over it, flickering the cubemap bright/dim by capture order.
      const layer = makeLayer({ name: 'probe', target: 'hdr', slab: NEAR0, skyCapture: true });
      const program: FrameStep[] = [
        { kind: 'render', target: 'sky-cubemap', slab: NEAR0, face: 0 },
        { kind: 'render', target: 'sky-cubemap', slab: NEAR0, face: 1 },
      ];
      const faceCtx = makeCtx();
      const skyCubemapFaceContexts = new Map<CubeFace, ReadyFrameContext>([
        [0, faceCtx],
        [1, faceCtx],
      ]);
      const { args, env } = makeArgs({ program, layers: [layer], skyCubemapFaceContexts });
      executeFrame(args);

      expect(attachmentOfDraw(env, layer, 0).loadOp).toBe('clear');
      expect(attachmentOfDraw(env, layer, 1).loadOp).toBe('clear');
    });

    it('never selects a capture step group by target alone — a layer targeting sky-cubemap without the flag is skipped', () => {
      const layer = makeLayer({ name: 'unflagged', target: 'sky-cubemap', slab: NEAR0 });
      const program: FrameStep[] = [
        { kind: 'render', target: 'sky-cubemap', slab: NEAR0, face: 0 },
      ];
      const faceCtx = makeCtx();
      const { args } = makeArgs({
        program,
        layers: [layer],
        skyCubemapFaceContexts: new Map([[0, faceCtx]]),
      });
      executeFrame(args);
      expect(layer.draw).not.toHaveBeenCalled();
    });

    it('a skyCapture-flagged layer is NOT drawn by its own ordinary (non-capture) render step under target-matching alone — slab/target still gate normally', () => {
      // The flag only changes SELECTION for a capture step; an ordinary step
      // still requires target-matching, so a flagged layer with a mismatched
      // target is skipped exactly as before Ruling 6.
      const layer = makeLayer({ name: 'roster', target: 'hdr', slab: NEAR0, skyCapture: true });
      const program: FrameStep[] = [{ kind: 'render', target: 'sky-cubemap', slab: NEAR0 }];
      const { args } = makeArgs({ program, layers: [layer] });
      executeFrame(args);
      expect(layer.draw).not.toHaveBeenCalled();
    });
  });

  describe('black-hole lens (hdr, NEAR0) roster split (Task 14b, Ruling 9)', () => {
    // A step's `lensPhase` narrows the (target, slab) group by
    // `ContentLayer.hdrPostLensing` — 'pre' excludes flagged layers, 'post'
    // admits only them. This is the mechanism that keeps orbit-trails/
    // body-glints drawing AFTER the lens step instead of under it.
    it("a 'pre' step excludes hdrPostLensing layers; a 'post' step draws only them", () => {
      const roster = makeLayer({ name: 'roster', target: 'hdr', slab: NEAR0 });
      const trails = makeLayer({
        name: 'orbit-trails',
        target: 'hdr',
        slab: NEAR0,
        hdrPostLensing: true,
      });
      const program: FrameStep[] = [
        { kind: 'render', target: 'hdr', slab: NEAR0, lensPhase: 'pre' },
        { kind: 'render', target: 'hdr', slab: NEAR0, lensPhase: 'post' },
      ];
      const { args } = makeArgs({ program, layers: [roster, trails] });
      executeFrame(args);
      expect(roster.draw).toHaveBeenCalledTimes(1);
      expect(trails.draw).toHaveBeenCalledTimes(1);
      // Each drew into a DIFFERENT pass — the 'pre'/'post' split opens two
      // passes even though both steps share (target: 'hdr', slab: NEAR0).
      expect(roster.draw.mock.calls[0]![0]).not.toBe(trails.draw.mock.calls[0]![0]);
    });

    it('a step with no lensPhase draws every matching layer regardless of hdrPostLensing — the untagged, outside-the-band shape', () => {
      const roster = makeLayer({ name: 'roster', target: 'hdr', slab: NEAR0 });
      const trails = makeLayer({
        name: 'orbit-trails',
        target: 'hdr',
        slab: NEAR0,
        hdrPostLensing: true,
      });
      const program: FrameStep[] = [{ kind: 'render', target: 'hdr', slab: NEAR0 }];
      const { args } = makeArgs({ program, layers: [roster, trails] });
      executeFrame(args);
      expect(roster.draw).toHaveBeenCalledTimes(1);
      expect(trails.draw).toHaveBeenCalledTimes(1);
      // Both drew into the SAME single pass — one untagged step, one group.
      expect(roster.draw.mock.calls[0]![0]).toBe(trails.draw.mock.calls[0]![0]);
    });
  });
});
