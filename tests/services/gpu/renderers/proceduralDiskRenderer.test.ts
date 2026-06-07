/**
 * proceduralDiskRenderer pack-loop tests.
 *
 * The renderer is mostly a thin wrapper around the shared
 * `instancedQuadRenderer` factory — what's worth pinning at this layer is
 * the per-instance Float32Array layout that the wrapper produces. The
 * shared factory is responsible for the vertex-buffer arrayStride, but
 * the slot-by-slot meaning of each float lives here.
 *
 * Hi-res LOD Task R1 grew the per-instance stride from 12 to 16 floats
 * to make room for hi-res-array layer attributes. The procedural shader
 * doesn't read them — its trailing 4 floats must be zero so the shared
 * vertex buffer is well-defined for every consumer.
 *
 * We intercept the inner factory's `draw` call by stubbing the GPUDevice
 * and reading back the `writeBuffer` payload the factory hands to the
 * GPU queue. That's the same byte stream the shader sees.
 */

import { describe, it, expect, vi } from 'vitest';
import { createProceduralDiskRenderer } from '../../../../src/services/gpu/renderers/proceduralDiskRenderer';
import { FLOATS_PER_INSTANCE } from '../../../../src/services/gpu/renderers/instancedQuadRenderer';
import type { ProceduralDiskInstance } from '../../../../src/@types/rendering/ProceduralDiskInstance';

function makeStubInit() {
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
    queue: {
      // The renderer's instance upload is the second writeBuffer call
      // (uniforms first, instance bytes second). We snapshot every call
      // and let the assertion pick out the instance payload.
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
          // Copy the snapshot — the renderer reuses its scratch
          // Float32Array, so a live view would mutate between draws.
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

  return {
    init: {
      device,
      context: null as unknown as GPUCanvasContext,
      format: 'rgba16float' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
      focusBgl: {} as unknown as import('../../../../src/@types/rendering/FocusUniformsBgl').FocusUniformsBgl,
    },
    writeBufferCalls,
  };
}

// Stub shared focus bind group passed into draw() — only bound, never read.
const FOCUS_BIND_GROUP = {} as unknown as GPUBindGroup;

function fakeProceduralInstance(overrides: Partial<ProceduralDiskInstance> = {}): ProceduralDiskInstance {
  return {
    x: 1,
    y: 2,
    z: 3,
    sizeWorldMpc: 0.05,
    axisRatio: 0.6,
    positionAngleDeg: 45,
    colourIndex: 0.7,
    crossfadeAlpha: 0.5,
    procFadeOut: 1,
    sourceCode: 0,
    localIdx: 0,
    ...overrides,
  };
}

describe('proceduralDiskRenderer pack loop (Task R1)', () => {
  it('pack writes 16 floats per instance — last 4 are zero (procedural shader does not read them)', () => {
    const { init, writeBufferCalls } = makeStubInit();
    const renderer = createProceduralDiskRenderer(init);

    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    const instances: ProceduralDiskInstance[] = [
      fakeProceduralInstance({ x: 10, y: 20, z: 30 }),
      fakeProceduralInstance({ x: 40, y: 50, z: 60 }),
    ];

    renderer.draw(pass, new Float32Array(16), [800, 600], [0, 0, 0], 100, FOCUS_BIND_GROUP, instances);

    // The factory calls writeBuffer twice per draw: uniforms first, then
    // the instance payload. The instance payload is the one we need.
    expect(writeBufferCalls.length).toBe(2);
    const instancePayload = writeBufferCalls[1]!.data;

    // 16 floats per instance × 2 instances = 32 floats.
    expect(FLOATS_PER_INSTANCE).toBe(16);
    expect(instancePayload.length).toBe(2 * FLOATS_PER_INSTANCE);

    // Instance 0: spot-check the meaningful slots round-trip, then
    // assert slots 12..15 are zero pad.
    expect(instancePayload[0]).toBe(10);
    expect(instancePayload[1]).toBe(20);
    expect(instancePayload[2]).toBe(30);
    expect(instancePayload[12]).toBe(0);
    expect(instancePayload[13]).toBe(0);
    expect(instancePayload[14]).toBe(0);
    expect(instancePayload[15]).toBe(0);

    // Instance 1: same pad invariant.
    const i1 = FLOATS_PER_INSTANCE;
    expect(instancePayload[i1 + 0]).toBe(40);
    expect(instancePayload[i1 + 12]).toBe(0);
    expect(instancePayload[i1 + 13]).toBe(0);
    expect(instancePayload[i1 + 14]).toBe(0);
    expect(instancePayload[i1 + 15]).toBe(0);
  });
});
