/**
 * pickProgram — the parallel per-slab pick program over the content-layer
 * registry.
 *
 * These tests isolate the program's orchestration from both the heavy
 * frame-context derivation and the real GPU: `pickFrameContext` is mocked to
 * a controlled `ReadyFrameContext | null`, the `layers` dep is a set of fake
 * `ContentLayer`s with `drawPick` / `enabled` spies, and the device is a fake
 * that records texture allocations, pass descriptors, and staging readbacks.
 * The per-slab draw work each `drawPick` delegates to (galaxyPickRenderer /
 * proceduralDiskRenderer / …) is covered by those renderers' own suites — the
 * program is name-blind and only calls `layer.drawPick` in registry order.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the pick-time camera derivation: the program calls `pickFrameContext`
// internally, but reproducing a ready context through the real derivation
// (isEngineReady + assembleOrbitCamera + deriveSlabs) needs a fully-wired
// EngineState. Mocking it lets each test hand the program a controlled ctx
// (or null) — the real derivation is pinned in `pickFrameContext.test.ts`.
vi.mock('../../../../src/services/engine/helpers/pickFrameContext', () => ({
  pickFrameContext: vi.fn(),
}));

import { createPickProgram } from '../../../../src/services/engine/frame/pickProgram';
import { pickFrameContext } from '../../../../src/services/engine/helpers/pickFrameContext';
import { NEAR0, COSMO } from '../../../../src/services/engine/frame/slabs';
import {
  PICK_SENTINEL_OFFSET,
  SELECTION_SOURCE_SHIFT,
} from '../../../../src/data/selectionEncoding';
import type { ContentLayer } from '../../../../src/@types/engine/frame/ContentLayer';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';

// ── Fixtures ──────────────────────────────────────────────────────────────

const CANVAS = { width: 100, height: 80 } as unknown as HTMLCanvasElement;

/** A ready ctx whose only substance is the two-slab table `slabViewOf` reads. */
function makeCtx(): ReadyFrameContext {
  const slab = (index: number): Slab => ({
    index,
    nearMpc: 0.01,
    farMpc: 50000,
    vp: new Float64Array(16),
    originRelative: false,
    precision: 'f32',
    reversedZ: false,
  });
  return {
    isReady: true,
    slabs: [slab(NEAR0), slab(COSMO)],
    canvasSize: { width: 100, height: 80 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
  } as unknown as ReadyFrameContext;
}

/**
 * A fake layer. Omit `drawPick` to model a non-pickable layer. Pass
 * `pickEnabled` to model a layer whose pick gate diverges from its draw gate
 * (planetsLayer's flat ∪ textured, the Earth caption stamp).
 */
function makeLayer(opts: {
  name: string;
  slab: number;
  enabled: boolean;
  pickEnabled?: boolean;
  drawPick?: ContentLayer['drawPick'];
}): ContentLayer {
  return {
    name: opts.name,
    slab: opts.slab,
    target: 'hdr',
    blend: 'additive',
    enabled: () => opts.enabled,
    draw: vi.fn(),
    ...(opts.pickEnabled !== undefined ? { pickEnabled: () => opts.pickEnabled } : {}),
    ...(opts.drawPick ? { drawPick: opts.drawPick } : {}),
  } as ContentLayer;
}

// A fake device: records texture allocations + pass descriptors, and drives
// pick() to completion (staging buffers have mapAsync / getMappedRange /
// unmap). `stagingValueForLabel` supplies the raw u32 each slab's staging
// buffer reads back; `mapAsyncImpl` lets a test defer the readback.
function makeDevice(
  config: {
    stagingValueForLabel?: (label: string) => number;
    mapAsyncImpl?: () => Promise<void>;
  } = {},
) {
  const createTextureCalls: Array<{ format: GPUTextureFormat; label?: string }> = [];
  const passDescriptors: Array<Record<string, unknown>> = [];
  let commandEncoderCount = 0;
  let copyCount = 0;

  const makePass = () => ({
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    draw: vi.fn(),
    end: vi.fn(),
  });

  const device = {
    createTexture: vi.fn((desc: { format: GPUTextureFormat; label?: string }) => {
      createTextureCalls.push({ format: desc.format, label: desc.label });
      // `__label` lets a test correlate a returned GPUTexture back to its slab
      // (pick:cosmo-target / pick:near0-target) — used to assert far→near order.
      return { createView: () => ({}), destroy: vi.fn(), __label: desc.label };
    }),
    createBuffer: vi.fn((desc?: { label?: string }) => {
      const label = desc?.label ?? '';
      return {
        mapAsync: vi.fn(config.mapAsyncImpl ?? (() => Promise.resolve())),
        getMappedRange: vi.fn(
          () =>
            new Uint32Array([config.stagingValueForLabel ? config.stagingValueForLabel(label) : 0])
              .buffer,
        ),
        unmap: vi.fn(),
        destroy: vi.fn(),
        __label: label,
      };
    }),
    createCommandEncoder: vi.fn(() => {
      commandEncoderCount++;
      return {
        beginRenderPass: vi.fn((desc: Record<string, unknown>) => {
          passDescriptors.push(desc);
          return makePass();
        }),
        copyTextureToBuffer: vi.fn(() => {
          copyCount++;
        }),
        finish: vi.fn(() => ({})),
      };
    }),
    queue: { submit: vi.fn() },
  };

  return {
    device: device as unknown as GPUDevice,
    createTextureCalls,
    passDescriptors,
    getCommandEncoderCount: () => commandEncoderCount,
    getCopyCount: () => copyCount,
  };
}

/** A state whose only pick-relevant substance is the timing service. */
function makeState(descriptorFor: () => GPURenderPassTimestampWrites | undefined): EngineState {
  return {
    gpu: { timingService: { descriptorFor: vi.fn(descriptorFor) } },
  } as unknown as EngineState;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('createPickProgram', () => {
  it('returns null while a readback is in flight', async () => {
    // A single staging buffer per slab; a second pick before the first
    // mapAsync resolves would map an already-mapped buffer. The inFlight
    // guard makes the second call bail immediately with null.
    let resolveFirst!: () => void;
    const firstMap = new Promise<void>((res) => {
      resolveFirst = res;
    });
    const { device } = makeDevice({ mapAsyncImpl: () => firstMap });
    vi.mocked(pickFrameContext).mockReturnValue(makeCtx());

    const layers = [makeLayer({ name: 'a', slab: COSMO, enabled: true, drawPick: vi.fn() })];
    const program = createPickProgram({
      device,
      canvas: CANVAS,
      state: makeState(() => undefined),
      layers,
    });

    const first = program.pick(10, 10); // hangs at mapAsync
    const second = await program.pick(10, 10); // second is guarded → null
    expect(second).toBeNull();

    resolveFirst();
    expect(await first).toBeNull(); // raw 0 → background
  });

  it('returns null with no enabled pickable layer — no encoder created', async () => {
    // A disabled pickable layer + an enabled non-pickable layer: neither
    // survives the `drawPick && enabled` filter, so pick bails before
    // touching the GPU.
    const { device, getCommandEncoderCount } = makeDevice();
    vi.mocked(pickFrameContext).mockReturnValue(makeCtx());

    const layers = [
      makeLayer({ name: 'disabled-pickable', slab: COSMO, enabled: false, drawPick: vi.fn() }),
      makeLayer({ name: 'enabled-nonpickable', slab: COSMO, enabled: true }),
    ];
    const program = createPickProgram({
      device,
      canvas: CANVAS,
      state: makeState(() => undefined),
      layers,
    });

    expect(await program.pick(10, 10)).toBeNull();
    expect(getCommandEncoderCount()).toBe(0);
  });

  it('runs drawPick only for enabled pickable layers, in registry order', async () => {
    const { device } = makeDevice();
    vi.mocked(pickFrameContext).mockReturnValue(makeCtx());

    const callLog: string[] = [];
    const layers = [
      makeLayer({ name: 'a', slab: COSMO, enabled: true, drawPick: () => callLog.push('a') }),
      // enabled but no drawPick — skipped.
      makeLayer({ name: 'b', slab: COSMO, enabled: true }),
      // pickable but disabled — skipped.
      makeLayer({ name: 'c', slab: COSMO, enabled: false, drawPick: () => callLog.push('c') }),
      makeLayer({ name: 'd', slab: COSMO, enabled: true, drawPick: () => callLog.push('d') }),
    ];
    const program = createPickProgram({
      device,
      canvas: CANVAS,
      state: makeState(() => undefined),
      layers,
    });

    await program.pick(10, 10);
    expect(callLog).toEqual(['a', 'd']);
  });

  it('admits a layer whose pickEnabled widens its enabled gate (pick set ⊃ draw set)', async () => {
    // The Bug A seam: a layer disabled for DRAW (enabled:false) but pickEnabled:true
    // must STILL be recorded into the pick pass — planetsLayer's textured-only frame
    // is the real case (pick = flat ∪ textured, draw = flat), and bodyGlintsLayer's
    // Earth-stamp-only frame the other. A layer with only enabled:false (no
    // pickEnabled) stays excluded, so the program falls back to `enabled` per layer.
    const { device } = makeDevice();
    vi.mocked(pickFrameContext).mockReturnValue(makeCtx());

    const callLog: string[] = [];
    const layers = [
      makeLayer({
        name: 'pick-wider',
        slab: COSMO,
        enabled: false,
        pickEnabled: true,
        drawPick: () => callLog.push('pick-wider'),
      }),
      makeLayer({
        name: 'draw-off',
        slab: COSMO,
        enabled: false,
        drawPick: () => callLog.push('draw-off'),
      }),
    ];
    const program = createPickProgram({
      device,
      canvas: CANVAS,
      state: makeState(() => undefined),
      layers,
    });

    await program.pick(10, 10);
    // Only the pickEnabled layer is admitted; the enabled-only-false layer is not.
    expect(callLog).toEqual(['pick-wider']);
  });

  it('decodes the cosmo texel readback via unpackPick', async () => {
    // raw = (sourceCode << SELECTION_SOURCE_SHIFT) | (localIdx + PICK_SENTINEL_OFFSET);
    // unpackPick strips the offset and splits the fields.
    const raw = ((3 << SELECTION_SOURCE_SHIFT) | (42 + PICK_SENTINEL_OFFSET)) >>> 0;
    const { device } = makeDevice({ stagingValueForLabel: () => raw });
    vi.mocked(pickFrameContext).mockReturnValue(makeCtx());

    const layers = [makeLayer({ name: 'a', slab: COSMO, enabled: true, drawPick: vi.fn() })];
    const program = createPickProgram({
      device,
      canvas: CANVAS,
      state: makeState(() => undefined),
      layers,
    });

    expect(await program.pick(10, 10)).toEqual({ sourceCode: 3, localIdx: 42 });
  });

  it('resolves across slabs with frontmostPick (near hit wins)', async () => {
    // Two pickable layers on two slabs; both textures hit. Because slabs fold
    // near→far and index 0 (NEAR0) is nearest, the near hit claims the pixel
    // even though the cosmological slab also drew something under the cursor.
    const nearRaw = ((5 << SELECTION_SOURCE_SHIFT) | (10 + PICK_SENTINEL_OFFSET)) >>> 0;
    const cosmoRaw = ((2 << SELECTION_SOURCE_SHIFT) | (7 + PICK_SENTINEL_OFFSET)) >>> 0;
    const { device } = makeDevice({
      stagingValueForLabel: (label) => (label.includes('near0') ? nearRaw : cosmoRaw),
    });
    vi.mocked(pickFrameContext).mockReturnValue(makeCtx());

    const layers = [
      makeLayer({ name: 'cosmo', slab: COSMO, enabled: true, drawPick: vi.fn() }),
      makeLayer({ name: 'near', slab: NEAR0, enabled: true, drawPick: vi.fn() }),
    ];
    const program = createPickProgram({
      device,
      canvas: CANVAS,
      state: makeState(() => undefined),
      layers,
    });

    expect(await program.pick(10, 10)).toEqual({ sourceCode: 5, localIdx: 10 });
  });

  it('never allocates pick:near0 at N=1 (no slab-0 pickable layer → one target)', async () => {
    // Only the cosmological slab has a pickable layer, so only pick:cosmo is
    // allocated: exactly one r32uint colour target, and no depth32float (the
    // near0 depth format) is ever created.
    const { device, createTextureCalls } = makeDevice();
    vi.mocked(pickFrameContext).mockReturnValue(makeCtx());

    const layers = [makeLayer({ name: 'a', slab: COSMO, enabled: true, drawPick: vi.fn() })];
    const program = createPickProgram({
      device,
      canvas: CANVAS,
      state: makeState(() => undefined),
      layers,
    });

    await program.pick(10, 10);

    const colourTargets = createTextureCalls.filter((c) => c.format === 'r32uint');
    expect(colourTargets).toHaveLength(1);
    expect(createTextureCalls.some((c) => c.format === 'depth32float')).toBe(false);
  });

  it('threads the pick timing descriptor into the pass', async () => {
    const sentinel = { __timing: 'pick' } as unknown as GPURenderPassTimestampWrites;
    const state = makeState(() => sentinel);
    const { device, passDescriptors } = makeDevice();
    vi.mocked(pickFrameContext).mockReturnValue(makeCtx());

    const layers = [makeLayer({ name: 'a', slab: COSMO, enabled: true, drawPick: vi.fn() })];
    const program = createPickProgram({ device, canvas: CANVAS, state, layers });

    await program.pick(10, 10);

    const descriptorFor = state.gpu.timingService.descriptorFor as ReturnType<typeof vi.fn>;
    expect(descriptorFor).toHaveBeenCalledWith('pick');
    // The cosmological pass carries the descriptor; the pass also clears the
    // colour target to 0 and the depth to 1 (the pick occlusion contract).
    const cosmoPass = passDescriptors.find((d) => d.timestampWrites === sentinel);
    expect(cosmoPass).toBeDefined();
    const colour = (cosmoPass!.colorAttachments as Array<Record<string, unknown>>)[0]!;
    expect(colour.clearValue).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(colour.loadOp).toBe('clear');
    const depth = cosmoPass!.depthStencilAttachment as Record<string, unknown>;
    expect(depth.depthClearValue).toBe(1.0);
  });

  it('renderForDebug records the same draws without readback and ignores inFlight', async () => {
    // A hanging pick keeps the program's inFlight guard set; renderForDebug
    // must still record the pickable draws and return the pick texture — it
    // never touches the staging buffers the guard protects.
    let resolveFirst!: () => void;
    const firstMap = new Promise<void>((res) => {
      resolveFirst = res;
    });
    const { device, getCopyCount } = makeDevice({ mapAsyncImpl: () => firstMap });
    vi.mocked(pickFrameContext).mockReturnValue(makeCtx());

    const drawPick = vi.fn();
    const layers = [makeLayer({ name: 'a', slab: COSMO, enabled: true, drawPick })];
    const program = createPickProgram({
      device,
      canvas: CANVAS,
      state: makeState(() => undefined),
      layers,
    });

    const inFlightPick = program.pick(10, 10); // hangs at mapAsync
    expect(drawPick).toHaveBeenCalledTimes(1);
    const copiesAfterPick = getCopyCount();

    const debugTextures = program.renderForDebug();
    expect(debugTextures).toHaveLength(1);
    // The debug recording replays the same drawPick — no extra readback.
    expect(drawPick).toHaveBeenCalledTimes(2);
    expect(getCopyCount()).toBe(copiesAfterPick); // renderForDebug issues no copyTextureToBuffer

    resolveFirst();
    await inFlightPick;
  });

  it('renderForDebug returns the NEAR0 texture when only a NEAR0 pickable is enabled', () => {
    // The regression the old COSMO-only filter caused: a star / Milky-Way pick
    // lives on NEAR0, and the debug overlay used to skip it entirely. With no
    // COSMO pickable enabled, renderForDebug must still return the NEAR0 slab's
    // pick texture (length 1) rather than an empty array.
    const { device } = makeDevice();
    vi.mocked(pickFrameContext).mockReturnValue(makeCtx());

    const layers = [makeLayer({ name: 'star', slab: NEAR0, enabled: true, drawPick: vi.fn() })];
    const program = createPickProgram({
      device,
      canvas: CANVAS,
      state: makeState(() => undefined),
      layers,
    });

    const textures = program.renderForDebug() as ReadonlyArray<{ __label?: string }>;
    expect(textures).toHaveLength(1);
    expect(textures[0]!.__label).toBe('pick:near0-target');
  });

  it('renderForDebug returns every enabled slab far→near', () => {
    // Both slabs have an enabled pickable. renderForDebug returns their pick
    // textures ordered FAR → NEAR so the overlay paints far first and near on
    // top — the same near-wins occlusion frontmostPick folds for hover/click.
    // NEAR0 (index 0) is nearest, COSMO (index 1) is farther, so the returned
    // order is [cosmo, near0].
    const { device } = makeDevice();
    vi.mocked(pickFrameContext).mockReturnValue(makeCtx());

    const layers = [
      makeLayer({ name: 'cosmo', slab: COSMO, enabled: true, drawPick: vi.fn() }),
      makeLayer({ name: 'near', slab: NEAR0, enabled: true, drawPick: vi.fn() }),
    ];
    const program = createPickProgram({
      device,
      canvas: CANVAS,
      state: makeState(() => undefined),
      layers,
    });

    const textures = program.renderForDebug() as ReadonlyArray<{ __label?: string }>;
    expect(textures.map((t) => t.__label)).toEqual(['pick:cosmo-target', 'pick:near0-target']);
  });

  it('renderForDebug returns an empty array when no slab has an enabled pickable', () => {
    const { device } = makeDevice();
    vi.mocked(pickFrameContext).mockReturnValue(makeCtx());

    const layers = [
      makeLayer({ name: 'disabled', slab: COSMO, enabled: false, drawPick: vi.fn() }),
    ];
    const program = createPickProgram({
      device,
      canvas: CANVAS,
      state: makeState(() => undefined),
      layers,
    });

    expect(program.renderForDebug()).toEqual([]);
  });

  it('returns null when the engine is not ready to pick', async () => {
    const { device, getCommandEncoderCount } = makeDevice();
    vi.mocked(pickFrameContext).mockReturnValue(null);

    const layers = [makeLayer({ name: 'a', slab: COSMO, enabled: true, drawPick: vi.fn() })];
    const program = createPickProgram({
      device,
      canvas: CANVAS,
      state: makeState(() => undefined),
      layers,
    });

    expect(await program.pick(10, 10)).toBeNull();
    expect(getCommandEncoderCount()).toBe(0);
  });
});
