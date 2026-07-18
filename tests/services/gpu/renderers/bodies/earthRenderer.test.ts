/**
 * earthRenderer construction + structural tests.
 *
 * Vitest runs in Node without a WebGPU surface, so every `create*` call the
 * renderer issues at construction returns a plausibly-shaped stand-in (mirrors
 * the mock style in `horizonShellRenderer.test.ts` / `texturedDiskRenderer`).
 * These tests pin the `Renderer` contract (non-empty `label`, `destroy`), the
 * method surface (`setTexture` / `draw` callable with the right arity), and
 * that the caller's `targetFormat` reaches the pipeline colour target. The
 * "round, correctly-textured Earth" assertion is the VISUAL gate deferred to
 * Task 13.
 */

import { describe, it, expect, vi } from 'vitest';
import { createEarthRenderer } from '../../../../../src/services/gpu/renderers/bodies/earthRenderer';
import { mipLevelCount } from '../../../../../src/services/gpu/lib/generateMipChain';
import type { Renderer } from '../../../../../src/@types/rendering/Renderer';

function mockDevice(recorders?: {
  renderPipelines?: GPURenderPipelineDescriptor[];
  textures?: GPUTextureDescriptor[];
  encoderCount?: { n: number };
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
        // generateMipChain reads mipLevelCount off the texture to size its loop.
        mipLevelCount: desc.mipLevelCount ?? 1,
        format: desc.format,
      };
    }),
    createBindGroupLayout: vi.fn(() => ({})),
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

describe('createEarthRenderer', () => {
  it('construct does not throw under the mock device', () => {
    expect(() => createEarthRenderer(mockDevice(), 'rgba16float', 'depth32float')).not.toThrow();
  });

  it('satisfies Renderer — non-empty label + destroy function', () => {
    const renderer = createEarthRenderer(mockDevice(), 'rgba16float', 'depth32float');
    renderer satisfies Renderer;
    expect(renderer.label.length).toBeGreaterThan(0);
    expect(typeof renderer.destroy).toBe('function');
    expect(() => renderer.destroy()).not.toThrow();
  });

  it('setTexture and draw are callable with the right arity', () => {
    const renderer = createEarthRenderer(mockDevice(), 'rgba16float', 'depth32float');

    expect(typeof renderer.setTexture).toBe('function');
    expect(renderer.setTexture.length).toBe(1);
    expect(typeof renderer.draw).toBe('function');
    expect(renderer.draw.length).toBe(2);

    // setTexture accepts an ImageBitmap-shaped value without throwing.
    const bitmap = { width: 4, height: 2 } as unknown as ImageBitmap;
    expect(() => renderer.setTexture(bitmap)).not.toThrow();

    // draw writes the 80-byte LitBodyUniforms record (20 f32) and records the
    // indexed draw against a stub pass.
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      setIndexBuffer: vi.fn(),
      drawIndexed: vi.fn(),
    } as unknown as GPURenderPassEncoder;
    expect(() => renderer.draw(pass, new Float32Array(20))).not.toThrow();
    expect(pass.drawIndexed).toHaveBeenCalledTimes(1);
  });

  it('bakes the given targetFormat into the pipeline colour target', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createEarthRenderer(mockDevice({ renderPipelines }), 'rgba16float', 'depth32float');
    expect(renderPipelines).toHaveLength(1);
    const target = Array.from(renderPipelines[0]!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
  });

  it('setTexture sizes the Earth texture with a full mip chain and runs the downsample passes', () => {
    // The lit Earth now consumes a mip chain (mipmapFilter linear) so the
    // surface stops shimmering as it shrinks toward the sub-pixel glint handoff.
    // Structural proof: setTexture sizes the texture with mipLevelCount(w,h)
    // levels, keeps RENDER_ATTACHMENT (required by generateMipChain's per-level
    // passes), and submits at least one downsample command buffer.
    const textures: GPUTextureDescriptor[] = [];
    const encoderCount = { n: 0 };
    const device = mockDevice({ textures, encoderCount });
    const renderer = createEarthRenderer(device, 'rgba16float', 'depth32float');
    const bitmap = { width: 8, height: 4 } as unknown as ImageBitmap;
    renderer.setTexture(bitmap);
    const earthTex = textures.find((t) => Array.isArray(t.size) && t.size[0] === 8);
    expect(earthTex).toBeDefined();
    expect(earthTex!.mipLevelCount).toBe(mipLevelCount(8, 4));
    expect((earthTex!.usage & GPUTextureUsage.RENDER_ATTACHMENT) !== 0).toBe(true);
    expect(encoderCount.n).toBeGreaterThan(0);
    // The sampler consumes the chain (mipmapFilter linear).
    const samplerCalls = (device.createSampler as unknown as { mock: { calls: unknown[][] } }).mock
      .calls;
    const earthSampler = samplerCalls
      .map((c) => c[0] as GPUSamplerDescriptor)
      .find((d) => d?.mipmapFilter === 'linear');
    expect(earthSampler).toBeDefined();
  });
});
