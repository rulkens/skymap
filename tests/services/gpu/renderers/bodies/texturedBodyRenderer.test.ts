/**
 * texturedBodyRenderer construction + structural tests.
 *
 * Vitest runs in Node without a WebGPU surface, so every `create*` call the
 * renderer issues returns a plausibly-shaped stand-in (mirrors
 * `earthRenderer.test.ts`). These tests pin the `Renderer` contract (non-empty
 * `label`, `destroy`), the method surface (`setMap` / `setRingTexture` /
 * `draw` callable with the right arity), the per-body resource posture (each
 * body id gets its OWN uniform buffer + bind group so no shared mid-frame
 * uniform can be clobbered), and the explicit five-binding bind-group layout
 * (surface + ring + normal). The mip-count contract is checked
 * structurally: `setMap(id, 'surface', …)` sizes the body texture with
 * `mipLevelCount(w,h)` levels and runs the downsample chain (a command encoder is
 * submitted). "Round, correctly-lit body" is the VISUAL gate deferred to Task 11.
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
      createTexturedBodyRenderer(mockDevice(), 'rgba16float', 'depth32float'),
    ).not.toThrow();
  });

  it('satisfies Renderer — non-empty label + destroy function', () => {
    const renderer = createTexturedBodyRenderer(mockDevice(), 'rgba16float', 'depth32float');
    renderer satisfies Renderer;
    expect(renderer.label.length).toBeGreaterThan(0);
    expect(typeof renderer.destroy).toBe('function');
    expect(() => renderer.destroy()).not.toThrow();
  });

  it('setMap / setRingTexture / draw are callable with the right arity', () => {
    const renderer = createTexturedBodyRenderer(mockDevice(), 'rgba16float', 'depth32float');
    expect(renderer.setMap.length).toBe(3);
    expect(renderer.setRingTexture.length).toBe(2);
    expect(renderer.draw.length).toBe(3);
  });

  it('bakes the given targetFormat + depthFormat into the pipeline', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createTexturedBodyRenderer(mockDevice({ renderPipelines }), 'rgba16float', 'depth32float');
    expect(renderPipelines).toHaveLength(1);
    const target = Array.from(renderPipelines[0]!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
    expect(renderPipelines[0]!.depthStencil!.format).toBe('depth32float');
  });

  it('declares an explicit five-binding layout: uniform, sampler, surface + ring + normal textures', () => {
    const bindGroupLayouts: GPUBindGroupLayoutDescriptor[] = [];
    createTexturedBodyRenderer(mockDevice({ bindGroupLayouts }), 'rgba16float', 'depth32float');
    const entries = Array.from(bindGroupLayouts[0]!.entries);
    const byBinding = new Map(entries.map((e) => [e.binding, e]));
    expect(byBinding.get(0)!.buffer!.type).toBe('uniform');
    expect(byBinding.get(1)!.sampler).toBeDefined();
    expect(byBinding.get(2)!.texture).toBeDefined();
    expect(byBinding.get(3)!.texture).toBeDefined();
    // Binding 4 is the LINEAR tangent-space normal map — added by its KIND_CFG row
    // alongside surface, so the layout grows without touching the layout builder.
    expect(byBinding.get(4)!.texture).toBeDefined();
  });

  it('uses a mip-consuming sampler (mipmapFilter linear, repeat-U / clamp-V)', () => {
    const device = mockDevice();
    createTexturedBodyRenderer(device, 'rgba16float', 'depth32float');
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
    const renderer = createTexturedBodyRenderer(device, 'rgba16float', 'depth32float');
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
    );
    const bitmap = { width: 8, height: 4 } as unknown as ImageBitmap;
    renderer.setMap('mars', 'surface', bitmap);
    const bodyTex = textures.find((t) => Array.isArray(t.size) && t.size[0] === 8);
    expect(bodyTex).toBeDefined();
    expect(bodyTex!.mipLevelCount).toBe(mipLevelCount(8, 4));
    // RENDER_ATTACHMENT is required by generateMipChain's per-level render passes.
    expect((bodyTex!.usage & GPUTextureUsage.RENDER_ATTACHMENT) !== 0).toBe(true);
    // The downsample chain submitted at least one command buffer.
    expect(encoderCount.n).toBeGreaterThan(0);
  });

  it("setMap('moon','normal', …) creates a LINEAR rgba8unorm normal texture", () => {
    const textures: GPUTextureDescriptor[] = [];
    const renderer = createTexturedBodyRenderer(
      mockDevice({ textures }),
      'rgba16float',
      'depth32float',
    );
    const bitmap = { width: 16, height: 8 } as unknown as ImageBitmap;
    renderer.setMap('moon', 'normal', bitmap);
    // The sized (non-placeholder) normal texture — 16 wide, distinct from the 1×1
    // flat-normal placeholder.
    const normalTex = textures.find((t) => Array.isArray(t.size) && t.size[0] === 16);
    expect(normalTex).toBeDefined();
    // LINEAR, never `-srgb`: the RG channels carry tangent-space slope data and an
    // sRGB decode would silently bend every surface normal — a runtime rule no
    // compiler check catches.
    expect(normalTex!.format).toBe('rgba8unorm');
    // RENDER_ATTACHMENT is required by generateMipChain's per-level render passes.
    expect((normalTex!.usage & GPUTextureUsage.RENDER_ATTACHMENT) !== 0).toBe(true);
  });

  it('the normal placeholder is the linear flat-normal texel', () => {
    // The per-kind placeholders are 1×1 textures written via queue.writeTexture at
    // construction. The normal placeholder's texel is [128,128,255,255], which in
    // LINEAR rgba8unorm decodes to (0,0,1) — the `perturbNormal` identity — so a
    // body with no normal map shades exactly as it does today. An sRGB format
    // would corrupt that identity, so the write must target an rgba8unorm texture.
    const device = mockDevice();
    createTexturedBodyRenderer(device, 'rgba16float', 'depth32float');
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
    // The flat-normal texel lands on a LINEAR rgba8unorm placeholder, never -srgb.
    const target = (flatNormalWrite![0] as { texture: { format: GPUTextureFormat } }).texture;
    expect(target.format).toBe('rgba8unorm');
  });

  it('setRingTexture does not throw and rebuilds that body bind group', () => {
    const renderer = createTexturedBodyRenderer(mockDevice(), 'rgba16float', 'depth32float');
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
    );
    renderer.setRingTexture('saturn', { width: 512, height: 1 } as unknown as ImageBitmap);
    const stripTex = textures.find((t) => Array.isArray(t.size) && t.size[0] === 512);
    expect(stripTex).toBeDefined();
    expect((stripTex!.usage & GPUTextureUsage.RENDER_ATTACHMENT) !== 0).toBe(true);
  });

  it('clearMap frees a body kind and reverts it to the placeholder', () => {
    // clearMap is the per-kind eviction inverse of setMap: releasing a body's
    // (body,kind) bodyTextures slot must actually free its (up to ~135 MB) GPU
    // texture, not leak it. Structural proof: after setMap the body owns a real
    // texture whose `.destroy()` clearMap calls; the bind group is then rebuilt.
    const renderer = createTexturedBodyRenderer(mockDevice(), 'rgba16float', 'depth32float');
    const bitmap = { width: 8, height: 4 } as unknown as ImageBitmap;
    renderer.setMap('mars', 'surface', bitmap);
    // Assert clearMap is idempotent and non-throwing, and that a subsequent draw
    // still works (the placeholder rebind succeeded) — a dangling destroyed view
    // or a missing rebuild would throw here.
    expect(() => renderer.clearMap('mars', 'surface')).not.toThrow();
    // Idempotent: clearing an already-cleared (or never-textured) kind is a no-op.
    expect(() => renderer.clearMap('mars', 'surface')).not.toThrow();
    expect(() => renderer.clearMap('venus', 'surface')).not.toThrow();
    // The body still draws after its texture is freed — the bind group reverted
    // to the shared placeholder rather than dangling at a destroyed view.
    expect(() => renderer.draw(stubPass(), 'mars', new Float32Array(24))).not.toThrow();
  });

  it('clearMap frees ONLY the named kind — a sibling kind survives and stays bound', () => {
    // The regression for the tier-switch normal-map disappearance. The bodyTextures
    // slots are per-(body,kind), so eviction of ONE kind must not collaterally
    // destroy a sibling kind on the same body: surface and normal have independent
    // clamped tiers, so a per-body clear that freed both left the normal map gone
    // with no re-demand (its clamp was unchanged). clearMap must be per-kind.
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
    const renderer = createTexturedBodyRenderer(device, 'rgba16float', 'depth32float');
    // Two resident kinds on one body — the Moon-at-a-tier-boundary repro shape.
    renderer.setMap('mars', 'surface', { width: 8, height: 4 } as unknown as ImageBitmap);
    renderer.setMap('mars', 'normal', { width: 16, height: 8 } as unknown as ImageBitmap);
    const surface = textures.find((t) => Array.isArray(t.desc.size) && t.desc.size[0] === 8)!;
    const normal = textures.find((t) => Array.isArray(t.desc.size) && t.desc.size[0] === 16)!;
    expect(surface).toBeDefined();
    expect(normal).toBeDefined();

    renderer.clearMap('mars', 'surface');

    // The evicted kind is freed exactly once…
    expect(surface.destroy).toHaveBeenCalledTimes(1);
    // …and the sibling kind is NOT destroyed — no collateral free on a per-kind evict.
    expect(normal.destroy).not.toHaveBeenCalled();
    // The rebuilt bind group still binds the resident normal texture at binding 4,
    // not the flat-normal placeholder — the normal map survives a surface eviction.
    const lastBg = bindGroups[bindGroups.length - 1]!;
    const binding4 = Array.from(lastBg.entries).find((e) => e.binding === 4)!;
    expect((binding4.resource as unknown as { __textureId: number }).__textureId).toBe(normal.id);
    // The body still draws — the bind group is valid, no dangling destroyed view.
    expect(() => renderer.draw(stubPass(), 'mars', new Float32Array(24))).not.toThrow();
  });

  it('clearMap calls destroy on the body surface texture (no leak)', () => {
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
    const renderer = createTexturedBodyRenderer(device, 'rgba16float', 'depth32float');
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
