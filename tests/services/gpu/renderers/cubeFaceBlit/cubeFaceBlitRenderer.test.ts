/**
 * cubeFaceBlitRenderer — structural tests against a mocked GPUDevice (Vitest
 * has no WebGPU surface; `bodyGlintRenderer.test.ts`'s pattern). Pinned: the
 * bind group wraps the cube view handed to THAT draw (a cached group would bind
 * a view a reconcile replaced), and the basis reaches the uniform buffer before
 * the draw, column-padded the way WGSL lays out a `mat3x3<f32>`.
 */

import { describe, it, expect, vi } from 'vitest';
import { createCubeFaceBlitRenderer } from '../../../../../src/services/gpu/renderers/cubeFaceBlit/cubeFaceBlitRenderer';
import type { Mat3 } from '../../../../../src/@types/math/Mat3';

function mockDevice() {
  const bindGroupDescs: GPUBindGroupDescriptor[] = [];
  const writes: Float32Array[] = [];
  const writeBuffer = vi.fn((_b: GPUBuffer, _o: number, data: Float32Array) =>
    writes.push(Float32Array.from(data)),
  );
  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createSampler: vi.fn(() => ({})),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createBindGroup: vi.fn((desc: GPUBindGroupDescriptor) => {
      bindGroupDescs.push(desc);
      return {};
    }),
    queue: { writeBuffer },
  } as unknown as GPUDevice;
  return { device, bindGroupDescs, writes, writeBuffer };
}

function mockPass() {
  return { setPipeline: vi.fn(), setBindGroup: vi.fn(), draw: vi.fn() };
}

describe('createCubeFaceBlitRenderer', () => {
  it('rebuilds its bind group per draw around the given cube view and writes the basis before the draw', () => {
    const m = mockDevice();
    const renderer = createCubeFaceBlitRenderer({ device: m.device, targetFormat: 'rgba16float' });
    const basis: Mat3 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const cubeA = { __view: 'a' } as unknown as GPUTextureView;
    const cubeB = { __view: 'b' } as unknown as GPUTextureView;

    const passA = mockPass();
    renderer.draw(passA as unknown as GPURenderPassEncoder, basis, cubeA);
    const passB = mockPass();
    renderer.draw(passB as unknown as GPURenderPassEncoder, basis, cubeB);

    const cubeOf = (desc: GPUBindGroupDescriptor) =>
      Array.from(desc.entries).find((e) => e.binding === 1)!.resource;
    expect(m.bindGroupDescs.map(cubeOf)).toEqual([cubeA, cubeB]);
    expect(passA.setBindGroup).toHaveBeenCalledWith(0, {});

    // The write precedes the draw it feeds, and pads each 3-float column to 16 bytes.
    expect(m.writeBuffer.mock.invocationCallOrder[0]!).toBeLessThan(
      passA.draw.mock.invocationCallOrder[0]!,
    );
    expect(Array.from(m.writes[0]!)).toEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);
    expect(passA.draw).toHaveBeenCalledWith(3);
  });
});
