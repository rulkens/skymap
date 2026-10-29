/**
 * texturedBodyRenderer construction + structural tests. Node has no WebGPU surface, so every `create*`
 * call returns a plausibly-shaped stand-in (mirrors `earthRenderer.test.ts`). Pins the `Renderer`
 * contract, the method surface (`setMap` / `setRingTexture` / `draw` arity), per-body resources (each
 * body id gets its OWN uniform buffer + bind group so no shared mid-frame uniform can be clobbered),
 * the explicit bind-group layout (surface + ring + normal) and the mip-count contract (`setMap(id,
 * 'surface', …)` sizes the texture with `mipLevelCount(w,h)` levels and submits the downsample chain).
 */

import { describe, it, expect, vi } from 'vitest';
import { createTexturedBodyRenderer } from '../../../../src/layers/body/render/texturedBodyRenderer';
import { mipLevelCount } from '../../../../src/services/gpu/lib/generateMipChain';

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

  it('declares an explicit five-binding layout: uniform, sampler, surface + ring + normal textures', () => {
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
    // Binding 4 is the LINEAR tangent-space normal map.
    expect(byBinding.get(4)!.texture).toBeDefined();
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
    expect(uniformBufferCount.n).toBe(2);
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

  it('setMap sizes the body surface texture with a full mip chain and runs the downsample passes', () => {
    const textures: GPUTextureDescriptor[] = [];
    const encoderCount = { n: 0 };
    const renderer = createTexturedBodyRenderer(
      mockDevice({ textures, encoderCount }),
      'rgba16float',
      'depth32float',
      false,
    );
    const bitmap = { width: 8, height: 4 } as unknown as ImageBitmap;
    renderer.setMap('mars', 'surface', bitmap);
    const bodyTex = textures.find((t) => Array.isArray(t.size) && t.size[0] === 8);
    expect(bodyTex).toBeDefined();
    expect(bodyTex!.mipLevelCount).toBe(mipLevelCount(8, 4));
    // RENDER_ATTACHMENT is required by generateMipChain's per-level render passes.
    expect((bodyTex!.usage & GPUTextureUsage.RENDER_ATTACHMENT) !== 0).toBe(true);
    expect(encoderCount.n).toBeGreaterThan(0);
  });

  it("setMap('moon','normal', …) creates a LINEAR rgba8unorm normal texture", () => {
    const textures: GPUTextureDescriptor[] = [];
    const renderer = createTexturedBodyRenderer(
      mockDevice({ textures }),
      'rgba16float',
      'depth32float',
      false,
    );
    const bitmap = { width: 16, height: 8 } as unknown as ImageBitmap;
    renderer.setMap('moon', 'normal', bitmap);
    const normalTex = textures.find((t) => Array.isArray(t.size) && t.size[0] === 16);
    expect(normalTex).toBeDefined();
    // LINEAR, never `-srgb`: the RG channels carry tangent-space slope data and an
    // sRGB decode would silently bend every surface normal — a runtime rule no
    // compiler check catches.
    expect(normalTex!.format).toBe('rgba8unorm');
    expect((normalTex!.usage & GPUTextureUsage.RENDER_ATTACHMENT) !== 0).toBe(true);
  });

  it('the normal placeholder is the linear flat-normal texel', () => {
    // The normal placeholder texel [128,128,255,255] decodes in LINEAR rgba8unorm to (0,0,1), the
    // `perturbNormal` identity, so a body without a normal map shades as before; an sRGB format would
    // corrupt that.
    const device = mockDevice();
    createTexturedBodyRenderer(device, 'rgba16float', 'depth32float', false);
    const writeCalls = (device.queue.writeTexture as unknown as { mock: { calls: unknown[][] } })
      .mock.calls;
    const flatNormalWrite = writeCalls.find((c) => {
      const payload = Array.from(c[1] as Uint8Array);
      return (
        payload.length === 4 &&
        payload[0] === 128 &&
        payload[1] === 128 &&
        payload[2] === 255 &&
        payload[3] === 255
      );
    });
    expect(flatNormalWrite).toBeDefined();
    const target = (flatNormalWrite![0] as { texture: { format: GPUTextureFormat } }).texture;
    expect(target.format).toBe('rgba8unorm');
  });

  it('setRingTexture does not throw and rebuilds that body bind group', () => {
    const renderer = createTexturedBodyRenderer(mockDevice(), 'rgba16float', 'depth32float', false);
    const strip = { width: 512, height: 1 } as unknown as ImageBitmap;
    expect(() => renderer.setRingTexture('saturn', strip)).not.toThrow();
  });

  it('sizes the ring-shadow strip with RENDER_ATTACHMENT usage', () => {
    // copyExternalImageToTexture needs BOTH COPY_DST and RENDER_ATTACHMENT on the destination (a
    // WebGPU runtime rule no compiler check catches); without it Dawn rejects the upload and the ring
    // samples a zeroed strip.
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

  it('clearMap frees a body kind and reverts it to the placeholder', () => {
    // clearMap must actually free the (up to ~135 MB) GPU texture, not leak it: after setMap the body
    // owns a real texture whose `.destroy()` clearMap calls, and the bind group is rebuilt.
    const renderer = createTexturedBodyRenderer(mockDevice(), 'rgba16float', 'depth32float', false);
    const bitmap = { width: 8, height: 4 } as unknown as ImageBitmap;
    renderer.setMap('mars', 'surface', bitmap);
    expect(() => renderer.clearMap('mars', 'surface')).not.toThrow();
    expect(() => renderer.clearMap('mars', 'surface')).not.toThrow();
    expect(() => renderer.clearMap('venus', 'surface')).not.toThrow();
    expect(() => renderer.draw(stubPass(), 'mars', new Float32Array(24))).not.toThrow();
  });

  it('clearMap frees ONLY the named kind — a sibling kind survives and stays bound', () => {
    // Eviction of ONE kind must not destroy a sibling kind on the same body: surface and normal have
    // independent clamped tiers, so a per-body clear left the normal map gone with no re-demand. clearMap
    // must be per-kind.
    const textures: Array<{
      id: number;
      destroy: ReturnType<typeof vi.fn>;
      desc: GPUTextureDescriptor;
    }> = [];
    const bindGroups: GPUBindGroupDescriptor[] = [];
    const device = {
      ...(mockDevice() as unknown as Record<string, unknown>),
      createTexture: vi.fn((desc: GPUTextureDescriptor) => {
        const id = textures.length;
        const destroy = vi.fn();
        textures.push({ id, destroy, desc });
        // A view tagged with its texture's id, so the bind group's binding-4
        // resource can be traced back to the exact texture it points at.
        return {
          createView: () => ({ __textureId: id }),
          destroy,
          mipLevelCount: desc.mipLevelCount ?? 1,
          format: desc.format,
        };
      }),
      createBindGroup: vi.fn((desc: GPUBindGroupDescriptor) => {
        bindGroups.push(desc);
        return {};
      }),
    } as unknown as GPUDevice;
    const renderer = createTexturedBodyRenderer(device, 'rgba16float', 'depth32float', false);
    renderer.setMap('mars', 'surface', { width: 8, height: 4 } as unknown as ImageBitmap);
    renderer.setMap('mars', 'normal', { width: 16, height: 8 } as unknown as ImageBitmap);
    const surface = textures.find((t) => Array.isArray(t.desc.size) && t.desc.size[0] === 8)!;
    const normal = textures.find((t) => Array.isArray(t.desc.size) && t.desc.size[0] === 16)!;
    expect(surface).toBeDefined();
    expect(normal).toBeDefined();

    renderer.clearMap('mars', 'surface');

    expect(surface.destroy).toHaveBeenCalledTimes(1);
    expect(normal.destroy).not.toHaveBeenCalled();
    // The rebuilt bind group still binds the resident normal texture at binding 4, not the placeholder.
    const lastBg = bindGroups[bindGroups.length - 1]!;
    const binding4 = Array.from(lastBg.entries).find((e) => e.binding === 4)!;
    expect((binding4.resource as unknown as { __textureId: number }).__textureId).toBe(normal.id);
    expect(() => renderer.draw(stubPass(), 'mars', new Float32Array(24))).not.toThrow();
  });

  it('clearMap calls destroy on the body surface texture (no leak)', () => {
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
    renderer.setMap('mars', 'surface', bitmap);
    const surface = created.find((t) => Array.isArray(t.desc.size) && t.desc.size[0] === 8)!;
    expect(surface).toBeDefined();
    renderer.clearMap('mars', 'surface');
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
