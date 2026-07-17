/**
 * bodyGlintRenderer construction + structural tests.
 *
 * Vitest runs in Node without a WebGPU surface, so every `create*` call the
 * renderer issues at construction returns a plausibly-shaped stand-in (mirrors
 * `starPointRenderer.test.ts`). These pin the `Renderer` contract, the `draw`
 * method surface, the batch-in-draw behaviour (count clamped to the cap, a
 * zero-count draw a no-op), the additive-depthless pipeline profile (the
 * load-bearing difference from the sphere-body renderers: additive blend on the
 * caller's `targetFormat` and NO `depthStencil`, because the hdr target has no
 * depth attachment), and the 7-float / 28-byte instance stride + offsets (the
 * vertex-stride keep-rule — a byte-layout drift here silently reads garbage).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createBodyGlintRenderer,
  MAX_GLINTS,
  INSTANCE_FLOATS,
} from '../../../../../src/services/gpu/renderers/bodies/bodyGlintRenderer';
import type { Renderer } from '../../../../../src/@types/rendering/Renderer';

function mockDevice(renderPipelines?: GPURenderPipelineDescriptor[]): GPUDevice {
  return {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBuffer: vi.fn((desc: GPUBufferDescriptor) => ({ label: desc.label, destroy: vi.fn() })),
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

function mockPass(): GPURenderPassEncoder {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    draw: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

// One packed instance record (position + color + brightness) per glint.
function batch(count: number): Float32Array {
  return new Float32Array(count * INSTANCE_FLOATS);
}

describe('createBodyGlintRenderer', () => {
  it('construct does not throw under the mock device (no depth format param)', () => {
    expect(() => createBodyGlintRenderer(mockDevice(), 'rgba16float')).not.toThrow();
  });

  it('satisfies Renderer — non-empty label + destroy function', () => {
    const renderer = createBodyGlintRenderer(mockDevice(), 'rgba16float');
    renderer satisfies Renderer;
    expect(renderer.label.length).toBeGreaterThan(0);
    expect(typeof renderer.destroy).toBe('function');
    expect(() => renderer.destroy()).not.toThrow();
  });

  it('draw has the batch-in signature arity (pass, instances, count, viewProj, viewportPx)', () => {
    const renderer = createBodyGlintRenderer(mockDevice(), 'rgba16float');
    expect(typeof renderer.draw).toBe('function');
    expect(renderer.draw.length).toBe(5);
  });

  it('draws 6×count, clamps count to the cap, and no-ops a zero-count batch', () => {
    const renderer = createBodyGlintRenderer(mockDevice(), 'rgba16float');

    // Zero count — nothing packed, nothing drawn.
    const empty = mockPass();
    renderer.draw(empty, batch(0), 0, new Float32Array(16), [1920, 1080]);
    expect(empty.draw).not.toHaveBeenCalled();

    // Two glints — one instanced draw of 6 vertices × 2 instances.
    const two = mockPass();
    renderer.draw(two, batch(2), 2, new Float32Array(16), [1920, 1080]);
    expect(two.draw).toHaveBeenCalledTimes(1);
    expect(two.draw).toHaveBeenCalledWith(6, 2);

    // Over-count — clamped to MAX_GLINTS rather than running off the buffer.
    const over = mockPass();
    renderer.draw(over, batch(MAX_GLINTS + 10), MAX_GLINTS + 10, new Float32Array(16), [1920, 1080]);
    expect(over.draw).toHaveBeenCalledWith(6, MAX_GLINTS);
  });

  it('bakes the additive depthless profile — targetFormat + one/one blend, no depthStencil', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createBodyGlintRenderer(mockDevice(renderPipelines), 'rgba16float');
    expect(renderPipelines).toHaveLength(1);
    const desc = renderPipelines[0]!;
    const target = Array.from(desc.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
    expect(target!.blend).toMatchObject({
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    });
    // The hdr target is depthless — a depthStencil state would validate-error
    // against a pass with no depth attachment.
    expect(desc.depthStencil).toBeUndefined();
  });

  it('instance layout stays byte-exact with bodyGlint/vertex.wesl — stride 28, offsets 0/12/24', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createBodyGlintRenderer(mockDevice(renderPipelines), 'rgba16float');
    const buffers = Array.from(renderPipelines[0]!.vertex.buffers!);
    expect(buffers).toHaveLength(1);
    const layout = buffers[0]!;
    expect(layout!.arrayStride).toBe(INSTANCE_FLOATS * 4);
    expect(layout!.arrayStride).toBe(28);
    expect(layout!.stepMode).toBe('instance');
    expect(Array.from(layout!.attributes)).toEqual([
      { shaderLocation: 0, offset: 0, format: 'float32x3' },
      { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32' },
    ]);
  });
});
