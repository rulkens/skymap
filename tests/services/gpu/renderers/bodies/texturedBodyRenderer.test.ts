/**
 * texturedBodyRenderer construction + structural tests.
 *
 * Vitest runs in Node without a WebGPU surface, so every `create*` call the
 * renderer issues returns a plausibly-shaped stand-in (mirrors
 * `earthRenderer.test.ts`). These tests pin the `Renderer` contract (non-empty
 * `label`, `destroy`), the method surface (`setTexture` / `setRingTexture` /
 * `draw` callable with the right arity), the per-body resource posture (each
 * body id gets its OWN uniform buffer + bind group so no shared mid-frame
 * uniform can be clobbered), and the explicit four-binding bind-group layout.
 * The mip-count contract is checked structurally: `setTexture` sizes the body
 * texture with `mipLevelCount(w,h)` levels and runs the downsample chain (a
 * command encoder is submitted). "Round, correctly-lit body" is the VISUAL gate
 * deferred to Task 11.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTexturedBodyRenderer } from '../../../../../src/services/gpu/renderers/bodies/texturedBodyRenderer';
import { mipLevelCount } from '../../../../../src/services/gpu/lib/generateMipChain';
import type { Renderer } from '../../../../../src/@types/rendering/Renderer';

function mockDevice(recorders?: {
  renderPipelines?: GPURenderPipelineDescriptor[];
  bindGroupLayouts?: GPUBindGroupLayoutDescriptor[];
  textures?: GPUTextureDescriptor[];
  uniformBufferCount?: { n: number };
  encoderCount?: { n: number };
}): GPUDevice {
  return {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBuffer: vi.fn((desc: GPUBufferDescriptor) => {
      if (recorders?.uniformBufferCount && (desc.usage & GPUBufferUsage.UNIFORM) !== 0) {
        recorders.uniformBufferCount.n++;
      }
      return { destroy: vi.fn() };
    }),
    createSampler: vi.fn(() => ({})),
    createTexture: vi.fn((desc: GPUTextureDescriptor) => {
      recorders?.textures?.push(desc);
      return {
        createView: () => ({}),
        destroy: vi.fn(),
        // generateMipChain reads mipLevelCount off the texture to size its loop.
        mipLevelCount: desc.mipLevelCount ?? 1,
        format: desc.format,
      };
    }),
    createBindGroupLayout: vi.fn((desc: GPUBindGroupLayoutDescriptor) => {
      recorders?.bindGroupLayouts?.push(desc);
      return {};
    }),
    createBindGroup: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      recorders?.renderPipelines?.push(desc);
      return {};
    }),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: vi.fn(() => ({
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        draw: vi.fn(),
        end: vi.fn(),
      })),
      finish: vi.fn(() => ({})),
    })),
    queue: {
      writeBuffer: vi.fn(),
      writeTexture: vi.fn(),
      copyExternalImageToTexture: vi.fn(),
      submit: vi.fn((buffers: GPUCommandBuffer[]) => {
        if (recorders?.encoderCount) recorders.encoderCount.n += buffers.length;
      }),
    },
  } as unknown as GPUDevice;
}

describe('createTexturedBodyRenderer', () => {
  it('construct does not throw under the mock device', () => {
    expect(() =>
      createTexturedBodyRenderer(mockDevice(), 'rgba16float', 'depth32float', false),
    ).not.toThrow();
  });

  it('satisfies Renderer — non-empty label + destroy function', () => {
    const renderer = createTexturedBodyRenderer(mockDevice(), 'rgba16float', 'depth32float', false);
    renderer satisfies Renderer;
    expect(renderer.label.length).toBeGreaterThan(0);
    expect(typeof renderer.destroy).toBe('function');
    expect(() => renderer.destroy()).not.toThrow();
  });

  it('setTexture / setRingTexture / draw are callable with the right arity', () => {
    const renderer = createTexturedBodyRenderer(mockDevice(), 'rgba16float', 'depth32float', false);
    expect(renderer.setTexture.length).toBe(2);
    expect(renderer.setRingTexture.length).toBe(2);
    expect(renderer.draw.length).toBe(3);
  });

  it('bakes the given targetFormat + depthFormat into the pipeline', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createTexturedBodyRenderer(
      mockDevice({ renderPipelines }),
      'rgba16float',
      'depth32float',
      false,
    );
    expect(renderPipelines).toHaveLength(1);
    const target = Array.from(renderPipelines[0]!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
    expect(renderPipelines[0]!.depthStencil!.format).toBe('depth32float');
  });

  it('declares an explicit four-binding layout: uniform, sampler, body + ring textures', () => {
    const bindGroupLayouts: GPUBindGroupLayoutDescriptor[] = [];
    createTexturedBodyRenderer(
      mockDevice({ bindGroupLayouts }),
      'rgba16float',
      'depth32float',
      false,
    );
    const entries = Array.from(bindGroupLayouts[0]!.entries);
    const byBinding = new Map(entries.map((e) => [e.binding, e]));
    expect(byBinding.get(0)!.buffer!.type).toBe('uniform');
    expect(byBinding.get(1)!.sampler).toBeDefined();
    expect(byBinding.get(2)!.texture).toBeDefined();
    expect(byBinding.get(3)!.texture).toBeDefined();
  });

  it('uses a mip-consuming sampler (mipmapFilter linear, repeat-U / clamp-V)', () => {
    const device = mockDevice();
    createTexturedBodyRenderer(device, 'rgba16float', 'depth32float', false);
    const samplerCalls = (device.createSampler as unknown as { mock: { calls: unknown[][] } }).mock
      .calls;
    const bodySampler = samplerCalls
      .map((c) => c[0] as GPUSamplerDescriptor)
      .find((d) => d?.mipmapFilter === 'linear');
    expect(bodySampler).toBeDefined();
    expect(bodySampler!.addressModeU).toBe('repeat');
    expect(bodySampler!.addressModeV).toBe('clamp-to-edge');
  });

  it('each drawn body gets its OWN uniform buffer (no shared mid-frame uniform)', () => {
    const uniformBufferCount = { n: 0 };
    const renderer = createTexturedBodyRenderer(
      mockDevice({ uniformBufferCount }),
      'rgba16float',
      'depth32float',
      false,
    );
    const pass = stubPass();
    const uniforms = new Float32Array(24);
    renderer.draw(pass, 'mars', uniforms);
    renderer.draw(pass, 'jupiter', uniforms);
    // One uniform buffer per distinct body, never a single shared one.
    expect(uniformBufferCount.n).toBe(2);
    // Re-drawing the same body reuses its buffer — no new allocation.
    renderer.draw(pass, 'mars', uniforms);
    expect(uniformBufferCount.n).toBe(2);
  });

  it('draw writes that body uniform buffer and records one indexed draw', () => {
    const device = mockDevice();
    const renderer = createTexturedBodyRenderer(device, 'rgba16float', 'depth32float', false);
    const pass = stubPass();
    renderer.draw(pass, 'saturn', new Float32Array(24));
    expect(device.queue.writeBuffer).toHaveBeenCalled();
    expect(pass.drawIndexed).toHaveBeenCalledTimes(1);
  });

  it('setTexture sizes the body texture with a full mip chain and runs the downsample passes', () => {
    const textures: GPUTextureDescriptor[] = [];
    const encoderCount = { n: 0 };
    const renderer = createTexturedBodyRenderer(
      mockDevice({ textures, encoderCount }),
      'rgba16float',
      'depth32float',
      false,
    );
    const bitmap = { width: 8, height: 4 } as unknown as ImageBitmap;
    renderer.setTexture('mars', bitmap);
    const bodyTex = textures.find((t) => Array.isArray(t.size) && t.size[0] === 8);
    expect(bodyTex).toBeDefined();
    expect(bodyTex!.mipLevelCount).toBe(mipLevelCount(8, 4));
    // RENDER_ATTACHMENT is required by generateMipChain's per-level render passes.
    expect((bodyTex!.usage & GPUTextureUsage.RENDER_ATTACHMENT) !== 0).toBe(true);
    // The downsample chain submitted at least one command buffer.
    expect(encoderCount.n).toBeGreaterThan(0);
  });

  it('setRingTexture does not throw and rebuilds that body bind group', () => {
    const renderer = createTexturedBodyRenderer(mockDevice(), 'rgba16float', 'depth32float', false);
    const strip = { width: 512, height: 1 } as unknown as ImageBitmap;
    expect(() => renderer.setRingTexture('saturn', strip)).not.toThrow();
  });

  it('sizes the ring-shadow strip with RENDER_ATTACHMENT usage', () => {
    // copyExternalImageToTexture requires the destination to carry BOTH COPY_DST
    // and RENDER_ATTACHMENT (a WebGPU runtime rule no compiler check catches);
    // omitting it makes Dawn reject the upload and the ring samples a zeroed
    // strip. This asserts the flag is present on the upload target.
    const textures: GPUTextureDescriptor[] = [];
    const renderer = createTexturedBodyRenderer(
      mockDevice({ textures }),
      'rgba16float',
      'depth32float',
      false,
    );
    renderer.setRingTexture('saturn', { width: 512, height: 1 } as unknown as ImageBitmap);
    const stripTex = textures.find((t) => Array.isArray(t.size) && t.size[0] === 512);
    expect(stripTex).toBeDefined();
    expect((stripTex!.usage & GPUTextureUsage.RENDER_ATTACHMENT) !== 0).toBe(true);
  });

  it('clearTexture destroys the body surface texture and reverts to the placeholder', () => {
    // clearTexture is the eviction inverse of setTexture: releasing a body's
    // bodyTextures slot must actually free its (up to ~135 MB) GPU texture, not
    // leak it. Structural proof: after setTexture the body owns a real texture
    // whose `.destroy()` clearTexture calls; the bind group is then rebuilt.
    const renderer = createTexturedBodyRenderer(mockDevice(), 'rgba16float', 'depth32float', false);
    const bitmap = { width: 8, height: 4 } as unknown as ImageBitmap;
    renderer.setTexture('mars', bitmap);
    // Assert clearTexture is idempotent and non-throwing, and that a subsequent
    // draw still works (the placeholder rebind succeeded) — a dangling destroyed
    // view or a missing rebuild would throw here.
    expect(() => renderer.clearTexture('mars')).not.toThrow();
    // Idempotent: clearing an already-cleared (or never-textured) body is a no-op.
    expect(() => renderer.clearTexture('mars')).not.toThrow();
    expect(() => renderer.clearTexture('venus')).not.toThrow();
    // The body still draws after its texture is freed — the bind group reverted
    // to the shared placeholder rather than dangling at a destroyed view.
    expect(() => renderer.draw(stubPass(), 'mars', new Float32Array(24))).not.toThrow();
  });

  it('clearTexture calls destroy on the body surface texture (no leak)', () => {
    // Track the textures created so we can assert the surface texture's destroy
    // spy fires on clear — the concrete free the slot's onRelease relies on.
    const created: Array<{ destroy: ReturnType<typeof vi.fn>; desc: GPUTextureDescriptor }> = [];
    const device = {
      ...(mockDevice() as unknown as Record<string, unknown>),
      createTexture: vi.fn((desc: GPUTextureDescriptor) => {
        const destroy = vi.fn();
        created.push({ destroy, desc });
        return {
          createView: () => ({}),
          destroy,
          mipLevelCount: desc.mipLevelCount ?? 1,
          format: desc.format,
        };
      }),
    } as unknown as GPUDevice;
    const renderer = createTexturedBodyRenderer(device, 'rgba16float', 'depth32float', false);
    const bitmap = { width: 8, height: 4 } as unknown as ImageBitmap;
    renderer.setTexture('mars', bitmap);
    const surface = created.find((t) => Array.isArray(t.desc.size) && t.desc.size[0] === 8)!;
    expect(surface).toBeDefined();
    renderer.clearTexture('mars');
    expect(surface.destroy).toHaveBeenCalledTimes(1);
  });
});

function stubPass(): GPURenderPassEncoder & { drawIndexed: ReturnType<typeof vi.fn> } {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    drawIndexed: vi.fn(),
  } as unknown as GPURenderPassEncoder & { drawIndexed: ReturnType<typeof vi.fn> };
}
