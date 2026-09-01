/**
 * texturedDiskRenderer pack-loop tests.
 *
 * Pins the per-instance Float32Array layout for the textured-disk
 * renderer. The 16-float stride packs `hiResLayerIdx` +
 * `hiResCrossfadeAlpha` into slots 12 and 13, and the calibrated
 * `nucleusOffset` (local corner frame) into slots 14 and 15. Pinning the
 * slot layout here guarantees the serializer stays in lockstep with the
 * vertex shader's `instance.hiRes` reads.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTexturedDiskRenderer } from '../../../../../src/services/gpu/renderers/galaxyCatalog/texturedDiskRenderer';
import { FLOATS_PER_INSTANCE } from '../../../../../src/services/gpu/renderers/galaxyCatalog/instancedQuadRenderer';
import type { DiskInstance } from '../../../../../src/@types/rendering/DiskInstance';
import type { FocusUniformsBgl } from '../../../../../src/@types/rendering/FocusUniformsBgl';

// Stub focus BGL (forwarded into the pipeline layout) + shared focus bind
// group (passed into draw, only bound). Both are opaque to the mock device.
const FOCUS_BGL = {} as unknown as FocusUniformsBgl;
const FOCUS_BIND_GROUP = {} as unknown as GPUBindGroup;

function makeStubCtx() {
  const writeBufferCalls: Array<{ data: Float32Array; offset: number }> = [];
  const renderPipelines: GPURenderPipelineDescriptor[] = [];
  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelines.push(desc);
      return { getBindGroupLayout: () => ({}) };
    }),
    createPipelineLayout: vi.fn(() => ({})),
    createBindGroupLayout: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createBindGroup: vi.fn(() => ({})),
    createSampler: vi.fn(() => ({})),
    createTexture: vi.fn(() => ({
      createView: () => ({}),
      destroy: vi.fn(),
    })),
    queue: {
      writeBuffer: vi.fn(
        (
          _buf: GPUBuffer,
          _bufOff: number,
          data: ArrayBufferView | ArrayBuffer,
          dataOff?: number,
          size?: number,
        ) => {
          const ab = (data as ArrayBufferView).buffer ?? (data as ArrayBuffer);
          const offset = dataOff ?? (data as ArrayBufferView).byteOffset ?? 0;
          const len =
            size ?? (data as ArrayBufferView).byteLength ?? (ab as ArrayBuffer).byteLength;
          const copy = new Uint8Array(len);
          copy.set(new Uint8Array(ab as ArrayBuffer, offset, len));
          writeBufferCalls.push({
            data: new Float32Array(copy.buffer),
            offset: _bufOff,
          });
        },
      ),
      submit: vi.fn(),
    },
  } as unknown as GPUDevice;

  const ctx = {
    device,
    context: null as unknown as GPUCanvasContext,
    targetFormat: 'rgba16float' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
  };

  return { ctx, writeBufferCalls, renderPipelines };
}

function fakeDiskInstance(overrides: Partial<DiskInstance> = {}): DiskInstance {
  return {
    x: 1,
    y: 2,
    z: 3,
    sizeWorld: 0.01,
    u0: 0,
    v0: 0,
    u1: 1,
    v1: 1,
    axisRatio: 0.7,
    positionAngleDeg: 30,
    fadeAlpha: 1,
    hiResLayerIdx: -1,
    hiResCrossfadeAlpha: 0,
    nucleusOffset: [0, 0],
    ...overrides,
  };
}

describe('texturedDiskRenderer pack loop (Task R1)', () => {
  it('pack writes hiResLayerIdx + hiResCrossfadeAlpha into slots 12, 13 and nucleusOffset into slots 14, 15', () => {
    const { ctx, writeBufferCalls } = makeStubCtx();
    const renderer = createTexturedDiskRenderer(ctx, FOCUS_BGL);

    // The textured disk renderer is atlas-capable AND hi-res-array-
    // capable (Task R3 flipped 'atlas.hiResArray: true' on the inner
    // factory so the BGL matches the fragment shader's hi-res sample
    // bindings). The inner factory withholds the bind group until BOTH
    // views are bound, so both stubs are required to unblock the
    // writeBuffer path.
    renderer.bindAtlas({} as GPUTextureView);
    renderer.bindHiResArray({} as GPUTextureView);

    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    const instances: DiskInstance[] = [
      fakeDiskInstance({
        hiResLayerIdx: 3,
        hiResCrossfadeAlpha: 0.7,
        nucleusOffset: [-0.5, 0.25],
      }),
      fakeDiskInstance({ hiResLayerIdx: 0, hiResCrossfadeAlpha: 0 }),
    ];

    renderer.draw(
      pass,
      new Float32Array(16) as never,
      [800, 600],
      [0, 0, 0],
      FOCUS_BIND_GROUP,
      instances,
    );

    // uniforms (1) + instance bytes (1) = 2 writeBuffer calls.
    expect(writeBufferCalls.length).toBe(2);
    const instancePayload = writeBufferCalls[1]!.data;

    expect(FLOATS_PER_INSTANCE).toBe(16);
    expect(instancePayload.length).toBe(2 * FLOATS_PER_INSTANCE);

    // Instance 0: hiResLayerIdx=3 at slot 12, hiResCrossfadeAlpha=0.7
    // at slot 13, nucleusOffset [-0.5, 0.25] at slots 14, 15. 0.7 has no
    // exact float32 representation, so allow a small tolerance —
    // `toBeCloseTo` defaults to 2 decimal places, which is far inside the
    // round-trip error.
    expect(instancePayload[12]).toBe(3);
    expect(instancePayload[13]).toBeCloseTo(0.7);
    expect(instancePayload[14]).toBe(-0.5);
    expect(instancePayload[15]).toBe(0.25);

    // Instance 1: hiResLayerIdx=0 at slot 12, hiResCrossfadeAlpha=0
    // at slot 13, default centred nucleus [0, 0] at slots 14, 15.
    const i1 = FLOATS_PER_INSTANCE;
    expect(instancePayload[i1 + 12]).toBe(0);
    expect(instancePayload[i1 + 13]).toBe(0);
    expect(instancePayload[i1 + 14]).toBe(0);
    expect(instancePayload[i1 + 15]).toBe(0);
  });

  it('forwards init.targetFormat to the inner pipeline colour target', () => {
    const { ctx, renderPipelines } = makeStubCtx();
    createTexturedDiskRenderer(ctx, FOCUS_BGL);
    expect(renderPipelines).toHaveLength(1);
    const target = Array.from(renderPipelines[0]!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
  });
});

describe('texturedDiskRenderer.draw — viewSlot (Task 13b)', () => {
  it('two draw() calls with different viewSlot land their @group(0) uniform write in different buffers', () => {
    const { ctx, writeBufferCalls } = makeStubCtx();
    const renderer = createTexturedDiskRenderer(ctx, FOCUS_BGL);
    renderer.bindAtlas({} as GPUTextureView);
    renderer.bindHiResArray({} as GPUTextureView);

    const bindGroupsAt0: unknown[] = [];
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: (slot: number, bg: unknown) => {
        if (slot === 0) bindGroupsAt0.push(bg);
      },
      setVertexBuffer: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    const instances: DiskInstance[] = [fakeDiskInstance()];

    // A sky-cubemap capture sweep: two `draw()` calls (different faces) in
    // the same frame, both before one `submit()` — mirrors the roster
    // convention pinned in `galaxyPointRenderer.test.ts` /
    // `starCatalogRenderer`'s own viewSlot tests.
    renderer.draw(
      pass,
      new Float32Array(16) as never,
      [512, 512],
      [0, 0, 0],
      FOCUS_BIND_GROUP,
      instances,
      1,
    );
    renderer.draw(
      pass,
      new Float32Array(16) as never,
      [512, 512],
      [0, 0, 0],
      FOCUS_BIND_GROUP,
      instances,
      2,
    );

    // The @group(0) bind group resolves to a DIFFERENT physical bind group
    // (over a different uniform buffer) per view slot — slot 2's write can
    // never land in slot 1's buffer (the writeBuffer/submit race this
    // closes; docs/RENDERER.md landmine #1).
    expect(bindGroupsAt0[0]).not.toBe(bindGroupsAt0[1]);

    // Two uniform writeBuffer calls (96 bytes / 24 floats each — the
    // instance-bytes writes are a separate, larger payload), one per slot.
    const uniformWrites = writeBufferCalls.filter((c) => c.data.length === 96 / 4);
    expect(uniformWrites).toHaveLength(2);
  });

  // The instance buffer is deliberately NOT ringed per view slot, unlike the
  // uniform: the justification is that every draw in a frame re-uploads
  // byte-identical instance bytes, so the last write is the right one for all
  // of them. That is a live invariant — the day a `DiskInstance` field becomes
  // camera-dependent, only the last captured face would render correctly and
  // nothing else would notice.
  it('packs identical instance bytes for different view slots and cameras', () => {
    const { ctx, writeBufferCalls } = makeStubCtx();
    const renderer = createTexturedDiskRenderer(ctx, FOCUS_BGL);
    renderer.bindAtlas({} as GPUTextureView);
    renderer.bindHiResArray({} as GPUTextureView);

    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    const instances: DiskInstance[] = [fakeDiskInstance({ hiResLayerIdx: 2 })];
    const vpA = Float32Array.from({ length: 16 }, (_unused, i) => i);
    const vpB = Float32Array.from({ length: 16 }, (_unused, i) => 100 - i);

    renderer.draw(pass, vpA as never, [512, 512], [0, 0, 0], FOCUS_BIND_GROUP, instances, 1);
    renderer.draw(pass, vpB as never, [800, 600], [7, -3, 11], FOCUS_BIND_GROUP, instances, 2);

    const instanceWrites = writeBufferCalls.filter(
      (c) => c.data.length === instances.length * FLOATS_PER_INSTANCE,
    );
    expect(instanceWrites).toHaveLength(2);
    expect(Array.from(instanceWrites[0]!.data)).toEqual(Array.from(instanceWrites[1]!.data));
  });

  it('defaults viewSlot to 0 when omitted', () => {
    const { ctx } = makeStubCtx();
    const renderer = createTexturedDiskRenderer(ctx, FOCUS_BGL);
    renderer.bindAtlas({} as GPUTextureView);
    renderer.bindHiResArray({} as GPUTextureView);

    const bindGroupsAt0: unknown[] = [];
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: (slot: number, bg: unknown) => {
        if (slot === 0) bindGroupsAt0.push(bg);
      },
      setVertexBuffer: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    const instances: DiskInstance[] = [fakeDiskInstance()];
    renderer.draw(
      pass,
      new Float32Array(16) as never,
      [800, 600],
      [0, 0, 0],
      FOCUS_BIND_GROUP,
      instances,
    );
    renderer.draw(
      pass,
      new Float32Array(16) as never,
      [800, 600],
      [0, 0, 0],
      FOCUS_BIND_GROUP,
      instances,
      0,
    );

    // Both calls land on slot 0's SAME bind group — an omitted viewSlot is
    // byte-identical to an explicit 0.
    expect(bindGroupsAt0[0]).toBe(bindGroupsAt0[1]);
  });
});
