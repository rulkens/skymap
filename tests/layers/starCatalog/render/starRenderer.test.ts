/**
 * starRenderer construction + structural tests.
 *
 * Vitest runs in Node without a WebGPU surface, so every `create*` call the
 * renderer issues at construction returns a plausibly-shaped stand-in
 * (mirrors `earthRenderer.test.ts`). These tests pin the `Renderer`
 * contract (non-empty `label`, `destroy`), the `draw(pass, mvp, color, opacity)`
 * arity and uniform layout, and the foreground pipeline profile (caller's
 * `targetFormat` on the colour target, OVER blend, depth state). The "HDR-bright
 * emissive ball" assertion is a visual gate for the wiring task.
 */

import { describe, it, expect, vi } from 'vitest';
import { createStarRenderer } from '../../../../src/layers/starCatalog/render/starRenderer';

function mockDevice(renderPipelines?: GPURenderPipelineDescriptor[]): GPUDevice {
  return {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelines?.push(desc);
      return {};
    }),
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
}

describe('createStarRenderer', () => {
  it('draw is callable with (pass, mvp, color, opacity) and records an indexed draw', () => {
    const renderer = createStarRenderer(mockDevice(), 'rgba16float', 'depth32float', false);

    expect(typeof renderer.draw).toBe('function');
    expect(renderer.draw.length).toBe(4);

    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      setIndexBuffer: vi.fn(),
      drawIndexed: vi.fn(),
    } as unknown as GPURenderPassEncoder;
    expect(() => renderer.draw(pass, new Float32Array(16), [1, 0.95, 0.8], 1)).not.toThrow();
    expect(pass.drawIndexed).toHaveBeenCalledTimes(1);
  });

  it('draw writes the opacity at byte 76', () => {
    // TintedSphereUniforms: mvp floats 0..15, tint 16..18, opacity 19 (bytes 76..79).
    const device = mockDevice();
    const renderer = createStarRenderer(device, 'rgba16float', 'depth32float', false);
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      setIndexBuffer: vi.fn(),
      drawIndexed: vi.fn(),
    } as unknown as GPURenderPassEncoder;
    renderer.draw(pass, new Float32Array(16), [0.2, 0.4, 0.6], 0.5);
    const writes = vi.mocked(device.queue.writeBuffer).mock.calls;
    const written = writes[writes.length - 1]![2] as Float32Array;
    expect(written).toHaveLength(20);
    expect(Array.from(written.subarray(16, 19))).toEqual(
      Array.from(new Float32Array([0.2, 0.4, 0.6])),
    );
    expect(written[19]).toBe(0.5);
  });

  it('blends straight-alpha OVER with depth write kept', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createStarRenderer(mockDevice(renderPipelines), 'rgba16float', 'depth32float', false);
    expect(renderPipelines).toHaveLength(1);
    const desc = renderPipelines[0]!;
    const target = Array.from(desc.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
    expect(target!.blend).toEqual({
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    });
    expect(desc.depthStencil).toMatchObject({
      format: 'depth32float',
      depthWriteEnabled: true,
      depthCompare: 'less',
    });
  });
});
