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
import { createEarthRenderer } from '../../../../src/services/gpu/renderers/earthRenderer';
import type { Renderer } from '../../../../src/@types/rendering/Renderer';

function mockDevice(renderPipelines?: GPURenderPipelineDescriptor[]): GPUDevice {
  return {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createSampler: vi.fn(() => ({})),
    createTexture: vi.fn(() => ({ createView: () => ({}), destroy: vi.fn() })),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelines?.push(desc);
      return {};
    }),
    queue: {
      writeBuffer: vi.fn(),
      writeTexture: vi.fn(),
      copyExternalImageToTexture: vi.fn(),
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

    // draw writes the MVP and records the indexed draw against a stub pass.
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      setIndexBuffer: vi.fn(),
      drawIndexed: vi.fn(),
    } as unknown as GPURenderPassEncoder;
    expect(() => renderer.draw(pass, new Float32Array(16))).not.toThrow();
    expect(pass.drawIndexed).toHaveBeenCalledTimes(1);
  });

  it('bakes the given targetFormat into the pipeline colour target', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createEarthRenderer(mockDevice(renderPipelines), 'rgba16float', 'depth32float');
    expect(renderPipelines).toHaveLength(1);
    const target = Array.from(renderPipelines[0]!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
  });
});
