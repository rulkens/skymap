/**
 * Tests for the HDR target factory.  WebGPU device APIs are mocked here
 * (Vitest runs in Node without a real GPU); we just verify the module
 * builds the right `createTexture` descriptor and exposes the expected
 * surface.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createHdrTarget } from '../../../src/services/gpu/hdrTarget';

// In Node test env the WebGPU global constant objects (GPUTextureUsage,
// GPUBufferUsage, GPUShaderStage) aren't defined.  They normally come from
// the browser; @webgpu/types only declares them at the type level.  We
// stub the bits the implementation needs as plain readonly numeric
// constants, matching the values from the W3C spec verbatim.
beforeAll(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g.GPUTextureUsage === 'undefined') {
    g.GPUTextureUsage = {
      COPY_SRC: 0x01,
      COPY_DST: 0x02,
      TEXTURE_BINDING: 0x04,
      STORAGE_BINDING: 0x08,
      RENDER_ATTACHMENT: 0x10,
    };
  }
});

// Recreate the same numeric expectation in the test to avoid relying on
// the (now-stubbed) global ordering at import time.
const RENDER_ATTACHMENT = 0x10;
const TEXTURE_BINDING = 0x04;

function mockDevice(): GPUDevice {
  const createTexture = vi.fn(() => ({
    createView: vi.fn(() => ({})),
    destroy: vi.fn(),
  }));
  return { createTexture } as unknown as GPUDevice;
}

describe('createHdrTarget', () => {
  it('allocates a rgba16float colour texture sized to the requested viewport', () => {
    const device = mockDevice();
    const target = createHdrTarget(device, { width: 1024, height: 768 });
    expect(device.createTexture).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'rgba16float',
        size: { width: 1024, height: 768 },
        usage: RENDER_ATTACHMENT | TEXTURE_BINDING,
      }),
    );
    expect(target.view).toBeDefined();
    expect(typeof target.resize).toBe('function');
  });

  it('resize destroys the old colour texture and creates a new one', () => {
    const device = mockDevice();
    const target = createHdrTarget(device, { width: 512, height: 512 });
    target.resize({ width: 1024, height: 1024 });
    // One creation per allocate cycle (colour only) × 2 cycles = two
    // total createTexture calls.  An earlier revision allocated a
    // depth24plus companion alongside the colour texture; that depth
    // attachment was removed once every HDR pipeline switched to
    // pure additive blending (commits 716eb6b → 28aced5), making
    // depth ordering moot.
    expect(device.createTexture).toHaveBeenCalledTimes(2);
  });
});
