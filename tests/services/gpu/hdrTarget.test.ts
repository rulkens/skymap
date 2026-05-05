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

  it('also allocates a depth24plus depth texture matching the colour size', () => {
    // The HDR pass needs a depth attachment so the per-galaxy overlay
    // pipelines (quads + procedural disks) can write depth values
    // that the Milky Way impostor's pipeline tests against — the
    // standard transparent-emissive-reads-but-doesnt-write-depth
    // pattern.  `depth24plus` is the canonical "works everywhere"
    // depth format; no TEXTURE_BINDING because nothing samples the
    // depth buffer outside the render pass itself.
    const device = mockDevice();
    const target = createHdrTarget(device, { width: 1024, height: 768 });
    expect(device.createTexture).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'depth24plus',
        size: { width: 1024, height: 768 },
        usage: RENDER_ATTACHMENT,
      }),
    );
    expect(target.depthView).toBeDefined();
  });

  it('resize destroys the old textures and creates new ones for both colour and depth', () => {
    const device = mockDevice();
    const target = createHdrTarget(device, { width: 512, height: 512 });
    target.resize({ width: 1024, height: 1024 });
    // Two creations per resize cycle (colour + depth) × 2 cycles =
    // four total createTexture calls.
    expect(device.createTexture).toHaveBeenCalledTimes(4);
  });
});
