/**
 * prefilterCubeGgx — structural tests against a mocked GPUDevice (Vitest has
 * no WebGPU surface; `generateMipChain.test.ts`'s pattern). The lobe quality
 * is the visual gate; what is pinned here is the wiring a bare call count
 * misses: each pass writes its own (mip, face) subresource while the source
 * view stays pinned to mip 0, and the dynamic offset a pass binds selects the
 * parameter block that names that pass's face and roughness.
 */

import { describe, it, expect, vi } from 'vitest';
import { prefilterCubeGgx } from '../../../../src/services/gpu/lib/prefilterCubeGgx';

type ViewStub = { __desc: GPUTextureViewDescriptor };

function mockCube(mipLevelCount: number): GPUTexture {
  return {
    format: 'rgba16float' as GPUTextureFormat,
    mipLevelCount,
    createView: vi.fn((desc: GPUTextureViewDescriptor): ViewStub => ({ __desc: desc })),
  } as unknown as GPUTexture;
}

function mockDevice() {
  const passDescs: GPURenderPassDescriptor[] = [];
  const bindGroupDescs: GPUBindGroupDescriptor[] = [];
  const dynamicOffsets: number[] = [];
  const writes: ArrayBuffer[] = [];
  const submit = vi.fn();
  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createSampler: vi.fn(() => ({})),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createBindGroup: vi.fn((desc: GPUBindGroupDescriptor) => {
      bindGroupDescs.push(desc);
      return {};
    }),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: vi.fn((desc: GPURenderPassDescriptor) => {
        passDescs.push(desc);
        return {
          setPipeline: vi.fn(),
          setBindGroup: vi.fn((_i: number, _bg: object, offsets: number[]) => {
            dynamicOffsets.push(offsets[0]!);
          }),
          draw: vi.fn(),
          end: vi.fn(),
        };
      }),
      finish: vi.fn(() => ({})),
    })),
    queue: {
      writeBuffer: vi.fn((_b: GPUBuffer, _o: number, data: ArrayBuffer) => writes.push(data)),
      submit,
    },
  } as unknown as GPUDevice;
  return { device, passDescs, bindGroupDescs, dynamicOffsets, writes, submit };
}

describe('prefilterCubeGgx', () => {
  it('opens one pass per (mip ≥ 1, face), rendering into that mip/layer while sampling a cube view pinned to mip 0', () => {
    const m = mockDevice();
    prefilterCubeGgx(m.device, mockCube(4)); // mips 1..3 × 6 faces

    expect(m.passDescs).toHaveLength(18);
    expect(m.submit).toHaveBeenCalledTimes(1);
    m.passDescs.forEach((desc, i) => {
      const view = Array.from(desc.colorAttachments)[0]!.view as unknown as ViewStub;
      expect(view.__desc.baseMipLevel).toBe(1 + Math.floor(i / 6));
      expect(view.__desc.mipLevelCount).toBe(1);
      expect(view.__desc.baseArrayLayer).toBe(i % 6);
      expect(view.__desc.arrayLayerCount).toBe(1);
    });

    expect(m.bindGroupDescs).toHaveLength(1);
    const src = Array.from(m.bindGroupDescs[0]!.entries).find((e) => e.binding === 0)!
      .resource as unknown as ViewStub;
    expect(src.__desc.dimension).toBe('cube');
    expect(src.__desc.baseMipLevel ?? 0).toBe(0);
    expect(src.__desc.mipLevelCount).toBe(1);
  });

  it('roughness climbs 0 → 1 across the mips, so the coarsest mip is the roughness-1 level the diffuse term reads', () => {
    const m = mockDevice();
    prefilterCubeGgx(m.device, mockCube(4));

    expect(m.writes).toHaveLength(1);
    const params = new DataView(m.writes[0]!);
    expect(m.dynamicOffsets).toHaveLength(18);
    m.dynamicOffsets.forEach((offset, i) => {
      expect(offset % 256).toBe(0);
      expect(params.getUint32(offset, true)).toBe(i % 6);
      expect(params.getFloat32(offset + 4, true)).toBeCloseTo((1 + Math.floor(i / 6)) / 3, 6);
    });
    expect(params.getFloat32(m.dynamicOffsets[17]! + 4, true)).toBe(1);
  });
});
