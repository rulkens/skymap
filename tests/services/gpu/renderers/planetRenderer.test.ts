/**
 * planetRenderer construction + structural tests.
 *
 * Vitest runs in Node without a WebGPU surface, so every `create*` call the
 * renderer issues at construction returns a plausibly-shaped stand-in
 * (mirrors `earthRenderer.test.ts`). These tests pin the `Renderer`
 * contract (non-empty `label`, `destroy`), the `draw(pass, mvp, albedo)`
 * arity, and the opaque foreground pipeline profile (caller's
 * `targetFormat` on the colour target, depth state present). The
 * "lambert-lit ball" assertion is a visual gate for the wiring task.
 */

import { describe, it, expect, vi } from 'vitest';
import { createPlanetRenderer } from '../../../../src/services/gpu/renderers/planetRenderer';
import type { Renderer } from '../../../../src/@types/rendering/Renderer';

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

describe('createPlanetRenderer', () => {
  it('construct does not throw under the mock device', () => {
    expect(() => createPlanetRenderer(mockDevice(), 'rgba16float', 'depth32float')).not.toThrow();
  });

  it('satisfies Renderer — non-empty label + destroy function', () => {
    const renderer = createPlanetRenderer(mockDevice(), 'rgba16float', 'depth32float');
    renderer satisfies Renderer;
    expect(renderer.label.length).toBeGreaterThan(0);
    expect(typeof renderer.destroy).toBe('function');
    expect(() => renderer.destroy()).not.toThrow();
  });

  it('draw is callable with (pass, mvp, albedo) and records an indexed draw', () => {
    const renderer = createPlanetRenderer(mockDevice(), 'rgba16float', 'depth32float');

    expect(typeof renderer.draw).toBe('function');
    expect(renderer.draw.length).toBe(3);

    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      setIndexBuffer: vi.fn(),
      drawIndexed: vi.fn(),
    } as unknown as GPURenderPassEncoder;
    expect(() => renderer.draw(pass, new Float32Array(16), [0.6, 0.5, 0.4])).not.toThrow();
    expect(pass.drawIndexed).toHaveBeenCalledTimes(1);
  });

  it('bakes the opaque foreground profile — targetFormat colour target + depth state', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createPlanetRenderer(mockDevice(renderPipelines), 'rgba16float', 'depth32float');
    expect(renderPipelines).toHaveLength(1);
    const desc = renderPipelines[0]!;
    const target = Array.from(desc.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
    // Opaque replace — no blend descriptor on the colour target.
    expect(target!.blend).toBeUndefined();
    expect(desc.depthStencil).toMatchObject({
      format: 'depth32float',
      depthWriteEnabled: true,
      depthCompare: 'less',
    });
  });
});
