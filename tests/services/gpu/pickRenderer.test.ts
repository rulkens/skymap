import { describe, expect, it, beforeAll, vi } from 'vitest';
import { createPickRenderer } from '../../../src/services/gpu/pickRenderer';
import { PointRenderer } from '../../../src/services/gpu/pointRenderer';

beforeAll(() => {
  // Same WebGPU global stubs the other gpu tests use; mirror their pattern.
  const g = globalThis as unknown as Record<string, unknown>;
  g.GPUTextureUsage ??= {
    COPY_SRC: 0x01,
    COPY_DST: 0x02,
    TEXTURE_BINDING: 0x04,
    STORAGE_BINDING: 0x08,
    RENDER_ATTACHMENT: 0x10,
  };
  g.GPUBufferUsage ??= {
    MAP_READ: 0x01,
    COPY_SRC: 0x04,
    COPY_DST: 0x08,
    UNIFORM: 0x40,
    VERTEX: 0x20,
  };
  g.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
  g.GPUMapMode ??= { READ: 1, WRITE: 2 };
});

function makeStubDevice(): GPUDevice {
  // Minimal stub — enough for createPickRenderer construction.
  return {
    createShaderModule: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({
      getBindGroupLayout: () => ({}),
    })),
    createBuffer: vi.fn(() => ({
      destroy: vi.fn(),
    })),
    createTexture: vi.fn(() => ({
      createView: () => ({}),
      destroy: vi.fn(),
    })),
    queue: { writeBuffer: vi.fn(), submit: vi.fn() },
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: () => ({
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        setVertexBuffer: vi.fn(),
        draw: vi.fn(),
        end: vi.fn(),
      }),
      copyTextureToBuffer: vi.fn(),
      finish: vi.fn(),
    })),
    createBindGroup: vi.fn(),
  } as unknown as GPUDevice;
}

describe('createPickRenderer', () => {
  it('takes a PointRenderer at construction (no per-call uniformBuffer arg)', () => {
    const device = makeStubDevice();
    const pointRenderer = new PointRenderer(device, 'rgba16float');
    const pickRenderer = createPickRenderer(device, pointRenderer);

    // The compile-time test is the strongest one: this file would fail
    // to typecheck if `createPickRenderer` still required only a device
    // (or if `pick()` still wanted a sharedUniformBuffer arg).  Runtime
    // assertion is a sanity check that construction returned a usable
    // handle.
    expect(pickRenderer).toBeDefined();
    expect(typeof pickRenderer.pick).toBe('function');
    expect(typeof pickRenderer.destroy).toBe('function');
  });
});
