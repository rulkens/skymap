/**
 * texturedDiskRenderer pack-loop tests.
 *
 * Pins the per-instance Float32Array layout for the textured-disk
 * renderer. Hi-res LOD Task R1 grew the stride to 16 floats; slots 12
 * and 13 carry the `hiResLayerIdx` + `hiResCrossfadeAlpha` fields from
 * the DiskInstance shape, slots 14 + 15 stay zero pad. The fragment
 * shader will start sampling them in Task R3 — pinning the slot layout
 * here guarantees the wiring stays right while the renderer is still
 * a silent passthrough.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTexturedDiskRenderer } from '../../../../src/services/gpu/renderers/texturedDiskRenderer';
import { FLOATS_PER_INSTANCE } from '../../../../src/services/gpu/renderers/instancedQuadRenderer';
import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';
import type { DiskInstance } from '../../../../src/@types/rendering/DiskInstance';

function makeStubCtx() {
  const writeBufferCalls: Array<{ data: Float32Array; offset: number }> = [];
  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: () => ({}) })),
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
          const len = size ?? (data as ArrayBufferView).byteLength ?? (ab as ArrayBuffer).byteLength;
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

  const ctx: GpuContext = {
    device,
    context: null as unknown as GPUCanvasContext,
    format: 'rgba16float',
    canvas: null as unknown as HTMLCanvasElement,
  };

  return { ctx, writeBufferCalls };
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
    ...overrides,
  };
}

describe('texturedDiskRenderer pack loop (Task R1)', () => {
  it('pack writes hiResLayerIdx + hiResCrossfadeAlpha into slots 12 and 13; slots 14, 15 stay zero', () => {
    const { ctx, writeBufferCalls } = makeStubCtx();
    const renderer = createTexturedDiskRenderer(ctx);

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
      fakeDiskInstance({ hiResLayerIdx: 3, hiResCrossfadeAlpha: 0.7 }),
      fakeDiskInstance({ hiResLayerIdx: 0, hiResCrossfadeAlpha: 0 }),
    ];

    renderer.draw(pass, new Float32Array(16) as never, [800, 600], [0, 0, 0], instances);

    // uniforms (1) + instance bytes (1) = 2 writeBuffer calls.
    expect(writeBufferCalls.length).toBe(2);
    const instancePayload = writeBufferCalls[1]!.data;

    expect(FLOATS_PER_INSTANCE).toBe(16);
    expect(instancePayload.length).toBe(2 * FLOATS_PER_INSTANCE);

    // Instance 0: hiResLayerIdx=3 at slot 12, hiResCrossfadeAlpha=0.7
    // at slot 13. 0.7 has no exact float32 representation, so allow a
    // small tolerance — `toBeCloseTo` defaults to 2 decimal places,
    // which is far inside the round-trip error.
    expect(instancePayload[12]).toBe(3);
    expect(instancePayload[13]).toBeCloseTo(0.7);
    expect(instancePayload[14]).toBe(0);
    expect(instancePayload[15]).toBe(0);

    // Instance 1: hiResLayerIdx=0 at slot 12, hiResCrossfadeAlpha=0
    // at slot 13.
    const i1 = FLOATS_PER_INSTANCE;
    expect(instancePayload[i1 + 12]).toBe(0);
    expect(instancePayload[i1 + 13]).toBe(0);
    expect(instancePayload[i1 + 14]).toBe(0);
    expect(instancePayload[i1 + 15]).toBe(0);
  });
});
