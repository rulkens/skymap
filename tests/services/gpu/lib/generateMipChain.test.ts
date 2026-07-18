/**
 * generateMipChain + mipLevelCount tests.
 *
 * Two layers, matching the brief:
 *
 *   - `mipLevelCount` is pure `floor(log2(max(w,h))) + 1` math — pinned with
 *     hand-computed values, including a non-power-of-two size, because a wrong
 *     count silently under- or over-allocates a texture's mip chain at every
 *     call site.
 *   - `generateMipChain` is exercised structurally against a mocked GPUDevice
 *     (Vitest has no WebGPU surface, mirroring `earthRenderer.test.ts`). The
 *     real downsample QUALITY is the VISUAL gate; here we pin that it issues
 *     exactly one render pass per level below 0, draws the fullscreen triangle
 *     each time, and wires each pass to sample the parent level (bind group)
 *     and render into the child level (colour attachment). A stale-view bug —
 *     sampling the same level it writes, or off-by-one on the level index —
 *     would slip past a bare call-count assertion, so we check the baseMipLevel
 *     wiring directly.
 */

import { describe, it, expect, vi } from 'vitest';
import { generateMipChain, mipLevelCount } from '../../../../src/services/gpu/lib/generateMipChain';

describe('mipLevelCount', () => {
  it('is floor(log2(max(w,h))) + 1 across power-of-two and non-power-of-two sizes', () => {
    expect(mipLevelCount(1, 1)).toBe(1); // 1x1 — already the smallest level
    expect(mipLevelCount(2, 1)).toBe(2); // 2x1 -> 1x1
    expect(mipLevelCount(256, 256)).toBe(9); // log2(256)=8, +1
    expect(mipLevelCount(8192, 4096)).toBe(14); // driven by max side (8192) -> log2=13, +1
    expect(mipLevelCount(640, 480)).toBe(10); // floor(log2(640))=9, +1
  });
});

type ViewStub = { __baseMipLevel: number | undefined };

function mockTexture(
  width: number,
  height: number,
  mipCount: number,
): { texture: GPUTexture; viewDescs: GPUTextureViewDescriptor[] } {
  const viewDescs: GPUTextureViewDescriptor[] = [];
  const texture = {
    width,
    height,
    format: 'rgba8unorm-srgb' as GPUTextureFormat,
    mipLevelCount: mipCount,
    createView: vi.fn((desc?: GPUTextureViewDescriptor): ViewStub => {
      viewDescs.push(desc ?? {});
      return { __baseMipLevel: desc?.baseMipLevel };
    }),
  } as unknown as GPUTexture;
  return { texture, viewDescs };
}

function mockDevice(): {
  device: GPUDevice;
  passDescs: GPURenderPassDescriptor[];
  bindGroupDescs: GPUBindGroupDescriptor[];
  draws: unknown[][];
  renderPipelineDescs: GPURenderPipelineDescriptor[];
  submitCount: () => number;
  beginRenderPassCount: () => number;
} {
  const passDescs: GPURenderPassDescriptor[] = [];
  const bindGroupDescs: GPUBindGroupDescriptor[] = [];
  const draws: unknown[][] = [];
  const renderPipelineDescs: GPURenderPipelineDescriptor[] = [];
  const beginRenderPass = vi.fn((desc: GPURenderPassDescriptor) => {
    passDescs.push(desc);
    return {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      draw: vi.fn((...args: unknown[]) => draws.push(args)),
      end: vi.fn(),
    } as unknown as GPURenderPassEncoder;
  });
  const submit = vi.fn();
  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createSampler: vi.fn(() => ({})),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelineDescs.push(desc);
      return {};
    }),
    createBindGroup: vi.fn((desc: GPUBindGroupDescriptor) => {
      bindGroupDescs.push(desc);
      return {};
    }),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass,
      finish: vi.fn(() => ({})),
    })),
    queue: { submit },
  } as unknown as GPUDevice;
  return {
    device,
    passDescs,
    bindGroupDescs,
    draws,
    renderPipelineDescs,
    submitCount: () => submit.mock.calls.length,
    beginRenderPassCount: () => beginRenderPass.mock.calls.length,
  };
}

describe('generateMipChain', () => {
  it('issues one fullscreen render pass per mip level below 0', () => {
    // 8x8 texture -> 4 mip levels (8,4,2,1) -> 3 downsample passes.
    const { texture } = mockTexture(8, 8, 4);
    const m = mockDevice();
    generateMipChain(m.device, texture);

    expect(m.beginRenderPassCount()).toBe(3);
    expect(m.draws).toHaveLength(3);
    for (const args of m.draws) {
      expect(args).toEqual([3, 1, 0, 0]); // covering triangle, one instance
    }
    expect(m.submitCount()).toBe(1); // one command buffer for the whole chain
  });

  it('bakes the texture format into the blit pipeline colour target', () => {
    const { texture } = mockTexture(4, 4, 3);
    const m = mockDevice();
    generateMipChain(m.device, texture);
    expect(m.renderPipelineDescs).toHaveLength(1);
    const target = Array.from(m.renderPipelineDescs[0]!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba8unorm-srgb');
  });

  it('samples the parent level and renders into the child level for each pass', () => {
    const { texture } = mockTexture(4, 4, 3); // levels 4,2,1 -> passes for level 1 and 2
    const m = mockDevice();
    generateMipChain(m.device, texture);

    // Pass i (0-based) writes child level i+1 sampling parent level i.
    for (let i = 0; i < 2; i++) {
      const attachment = Array.from(m.passDescs[i]!.colorAttachments)[0]!;
      expect((attachment!.view as unknown as ViewStub).__baseMipLevel).toBe(i + 1);

      const entries = Array.from(m.bindGroupDescs[i]!.entries) as GPUBindGroupEntry[];
      const srcEntry = entries.find((e) => e.binding === 0)!;
      expect((srcEntry.resource as unknown as ViewStub).__baseMipLevel).toBe(i);
    }
  });

  it('is a no-op for a single-level texture (nothing to downsample)', () => {
    const { texture } = mockTexture(1, 1, 1);
    const m = mockDevice();
    generateMipChain(m.device, texture);
    expect(m.beginRenderPassCount()).toBe(0);
    expect(m.submitCount()).toBe(0);
  });
});
