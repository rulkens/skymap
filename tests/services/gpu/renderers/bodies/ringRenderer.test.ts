/**
 * ringRenderer construction + structural tests + the RingUniforms byte-layout
 * keep-rule.
 *
 * Vitest runs in Node without a WebGPU surface, so every `create*` call the
 * renderer issues returns a plausibly-shaped stand-in (mirrors
 * `earthRenderer.test.ts`). These pin the `Renderer` contract (non-empty
 * `label`, `destroy`), the method surface (`setTexture` / `draw` arity), and the
 * ring-specific pipeline profile (straight-alpha OVER blend, `cullMode: 'none'`,
 * depth-tested but `depthWriteEnabled: false`). The `packRingUniforms` byte
 * offsets are asserted here as the uniform-layout keep-rule — a silent drift in
 * that packing is exactly the invisible-until-iOS-drops-the-frame class the
 * struct/packer SSOT guards. "Correctly-lit, shadowed ring" is the VISUAL gate
 * (Task 11).
 */

import { describe, it, expect, vi } from 'vitest';
import { createRingRenderer } from '../../../../../src/services/gpu/renderers/bodies/ringRenderer';
import {
  packRingUniforms,
  RING_UNIFORM_FLOATS,
} from '../../../../../src/utils/gpu/packRingUniforms';
import type { Renderer } from '../../../../../src/@types/rendering/Renderer';

function mockDevice(recorders?: {
  renderPipelines?: GPURenderPipelineDescriptor[];
  bindGroupLayouts?: GPUBindGroupLayoutDescriptor[];
  textures?: GPUTextureDescriptor[];
}): GPUDevice {
  return {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createSampler: vi.fn(() => ({})),
    createTexture: vi.fn((desc: GPUTextureDescriptor) => {
      recorders?.textures?.push(desc);
      return {
        createView: () => ({}),
        destroy: vi.fn(),
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
    queue: {
      writeBuffer: vi.fn(),
      writeTexture: vi.fn(),
      copyExternalImageToTexture: vi.fn(),
    },
  } as unknown as GPUDevice;
}

function stubPass(): GPURenderPassEncoder & { drawIndexed: ReturnType<typeof vi.fn> } {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    drawIndexed: vi.fn(),
  } as unknown as GPURenderPassEncoder & { drawIndexed: ReturnType<typeof vi.fn> };
}

describe('createRingRenderer', () => {
  it('construct does not throw under the mock device', () => {
    expect(() => createRingRenderer(mockDevice(), 'rgba16float', 'depth32float')).not.toThrow();
  });

  it('satisfies Renderer — non-empty label + destroy function', () => {
    const renderer = createRingRenderer(mockDevice(), 'rgba16float', 'depth32float');
    renderer satisfies Renderer;
    expect(renderer.label.length).toBeGreaterThan(0);
    expect(typeof renderer.destroy).toBe('function');
    expect(() => renderer.destroy()).not.toThrow();
  });

  it('setTexture / draw are callable with the right arity', () => {
    const renderer = createRingRenderer(mockDevice(), 'rgba16float', 'depth32float');
    expect(typeof renderer.setTexture).toBe('function');
    expect(renderer.setTexture.length).toBe(1);
    expect(typeof renderer.draw).toBe('function');
    expect(renderer.draw.length).toBe(2);

    const strip = { width: 512, height: 1 } as unknown as ImageBitmap;
    expect(() => renderer.setTexture(strip)).not.toThrow();

    const pass = stubPass();
    expect(() => renderer.draw(pass, new Float32Array(RING_UNIFORM_FLOATS))).not.toThrow();
    expect(pass.drawIndexed).toHaveBeenCalledTimes(1);
  });

  it('sizes the ring strip with RENDER_ATTACHMENT usage', () => {
    // copyExternalImageToTexture requires the destination to carry BOTH COPY_DST
    // and RENDER_ATTACHMENT (a WebGPU runtime rule no compiler check catches);
    // omitting it makes Dawn reject the upload and the ring samples a zeroed
    // strip. This asserts the flag is present on the upload target.
    const textures: GPUTextureDescriptor[] = [];
    const renderer = createRingRenderer(mockDevice({ textures }), 'rgba16float', 'depth32float');
    renderer.setTexture({ width: 512, height: 1 } as unknown as ImageBitmap);
    const stripTex = textures.find((t) => Array.isArray(t.size) && t.size[0] === 512);
    expect(stripTex).toBeDefined();
    expect((stripTex!.usage & GPUTextureUsage.RENDER_ATTACHMENT) !== 0).toBe(true);
  });

  it('bakes the foreground profile: over blend, two-sided, depth read / no write', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createRingRenderer(mockDevice({ renderPipelines }), 'rgba16float', 'depth32float');
    expect(renderPipelines).toHaveLength(1);
    const pipeline = renderPipelines[0]!;
    const target = Array.from(pipeline.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
    // Premultiplied OVER — the fragment premultiplies its reflected colour by
    // coverage itself (so it can lift that term to full albedo where it occults
    // the planet), hence 'one', not 'src-alpha'.
    expect(target!.blend!.color.srcFactor).toBe('one');
    expect(target!.blend!.color.dstFactor).toBe('one-minus-src-alpha');
    // Two-sided annulus.
    expect(pipeline.primitive!.cullMode).toBe('none');
    // Depth-tested against the opaque spheres, but writes no depth.
    expect(pipeline.depthStencil!.format).toBe('depth32float');
    expect(pipeline.depthStencil!.depthCompare).toBe('less');
    expect(pipeline.depthStencil!.depthWriteEnabled).toBe(false);
  });

  it('declares a three-binding layout: uniform, sampler, ring strip', () => {
    const bindGroupLayouts: GPUBindGroupLayoutDescriptor[] = [];
    createRingRenderer(mockDevice({ bindGroupLayouts }), 'rgba16float', 'depth32float');
    const entries = Array.from(bindGroupLayouts[0]!.entries);
    const byBinding = new Map(entries.map((e) => [e.binding, e]));
    expect(byBinding.get(0)!.buffer!.type).toBe('uniform');
    expect(byBinding.get(1)!.sampler).toBeDefined();
    expect(byBinding.get(2)!.texture).toBeDefined();
  });
});

describe('packRingUniforms byte layout (RingUniforms keep-rule)', () => {
  it('places sunDirLocal@64, planetRadiusRatio@76, camPosLocal@80, innerRatio@92, size 96', () => {
    const mvp = Float32Array.from({ length: 16 }, (_, i) => i + 1);
    const sun: [number, number, number] = [0.1, 0.2, 0.3];
    const cam: [number, number, number] = [1.5, -2.5, 3.5];
    const u = packRingUniforms(mvp, sun, 0.43, cam, 0.53);

    // 96 bytes = 24 f32.
    expect(u).toHaveLength(24);
    expect(u.byteLength).toBe(96);
    // mvp at floats 0..15 (byte 0..63).
    for (let i = 0; i < 16; i++) expect(u[i]).toBe(mvp[i]);
    // sunDirLocal at floats 16..18 (byte 64).
    expect(u[16]).toBeCloseTo(0.1);
    expect(u[17]).toBeCloseTo(0.2);
    expect(u[18]).toBeCloseTo(0.3);
    // planetRadiusRatio at float 19 (byte 76) — fills sunDirLocal's vec3 tail.
    expect(u[19]).toBeCloseTo(0.43);
    // camPosLocal at floats 20..22 (byte 80) — a 16-byte-aligned vec3.
    expect(u[20]).toBeCloseTo(1.5);
    expect(u[21]).toBeCloseTo(-2.5);
    expect(u[22]).toBeCloseTo(3.5);
    // innerRatio at float 23 (byte 92) — fills camPosLocal's vec3 tail.
    expect(u[23]).toBeCloseTo(0.53);
  });
});
