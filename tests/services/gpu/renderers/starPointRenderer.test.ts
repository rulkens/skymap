/**
 * starPointRenderer construction + structural tests.
 *
 * Vitest runs in Node without a WebGPU surface, so every `create*` call the
 * renderer issues at construction returns a plausibly-shaped stand-in
 * (mirrors `earthRenderer.test.ts`). These tests pin the `Renderer`
 * contract, the `setStars` / `draw` method surface, the late-binding
 * behaviour (draw is a no-op until stars land, and again after an empty
 * upload), and the additive-depthless pipeline profile — the load-bearing
 * difference from the sphere-body renderers: additive blend on the caller's
 * `targetFormat` and NO `depthStencil` state, because the hdr target has no
 * depth attachment.
 */

import { describe, it, expect, vi } from 'vitest';
import { createStarPointRenderer } from '../../../../src/services/gpu/renderers/starPointRenderer';
import type { Renderer } from '../../../../src/@types/rendering/Renderer';
import type { StarBody } from '../../../../src/@types/scene/StarBody';

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

const SUN: StarBody = {
  id: 'sun',
  label: 'Sun',
  positionMpc: [0, 0, 0],
  absMag: 4.83,
  color: [1, 0.95, 0.85],
  radiusKm: 695_700,
};

const SIRIUS: StarBody = {
  id: 'sirius',
  label: 'Sirius',
  positionMpc: [1.6e-6, 2.1e-6, -0.4e-6],
  absMag: 1.43,
  color: [0.75, 0.85, 1],
  radiusKm: 1_189_600,
};

describe('createStarPointRenderer', () => {
  it('construct does not throw under the mock device (no depth format param)', () => {
    expect(() => createStarPointRenderer(mockDevice(), 'rgba16float')).not.toThrow();
  });

  it('satisfies Renderer — non-empty label + destroy function', () => {
    const renderer = createStarPointRenderer(mockDevice(), 'rgba16float');
    renderer satisfies Renderer;
    expect(renderer.label.length).toBeGreaterThan(0);
    expect(typeof renderer.destroy).toBe('function');
    expect(() => renderer.destroy()).not.toThrow();
  });

  it('setStars and draw are callable with the right arity', () => {
    const renderer = createStarPointRenderer(mockDevice(), 'rgba16float');
    expect(typeof renderer.setStars).toBe('function');
    expect(renderer.setStars.length).toBe(1);
    expect(typeof renderer.draw).toBe('function');
    expect(renderer.draw.length).toBe(3);
  });

  it('draw is a no-op before setStars, draws 6×N after, and clears on empty upload', () => {
    const renderer = createStarPointRenderer(mockDevice(), 'rgba16float');

    // Late binding: nothing uploaded yet — no draw call recorded.
    const before = mockPass();
    expect(() => renderer.draw(before, new Float32Array(16), [1920, 1080])).not.toThrow();
    expect(before.draw).not.toHaveBeenCalled();

    // Two stars uploaded — one instanced draw of 6 vertices × 2 instances.
    renderer.setStars([SUN, SIRIUS]);
    const after = mockPass();
    renderer.draw(after, new Float32Array(16), [1920, 1080]);
    expect(after.draw).toHaveBeenCalledTimes(1);
    expect(after.draw).toHaveBeenCalledWith(6, 2);

    // Empty upload clears the renderer back to the no-op state.
    renderer.setStars([]);
    const cleared = mockPass();
    renderer.draw(cleared, new Float32Array(16), [1920, 1080]);
    expect(cleared.draw).not.toHaveBeenCalled();
  });

  it('reuses the instance buffer across same-length setStars — one createBuffer, one writeBuffer per upload', () => {
    const device = mockDevice();
    const renderer = createStarPointRenderer(device, 'rgba16float');

    const createBuffer = device.createBuffer as unknown as ReturnType<typeof vi.fn>;
    const writeBuffer = device.queue.writeBuffer as unknown as ReturnType<typeof vi.fn>;

    const instanceCreates = () =>
      createBuffer.mock.calls.filter(
        ([desc]) => (desc as GPUBufferDescriptor).label === 'star-points-instance-buffer',
      ).length;
    const instanceUploads = () =>
      writeBuffer.mock.calls.filter(
        ([buffer]) => (buffer as { label?: string }).label === 'star-points-instance-buffer',
      ).length;

    // Per-frame `starPointsLayer.draw` re-hands camera-relative anchors each
    // frame, so `setStars` fires every frame with the same star count. That
    // must NOT churn a fresh GPU buffer per call: allocate once, re-upload.
    renderer.setStars([SUN, SIRIUS]);
    renderer.setStars([SUN, SIRIUS]);

    expect(instanceCreates()).toBe(1);
    expect(instanceUploads()).toBe(2);
  });

  it('bakes the additive depthless profile — targetFormat + one/one blend, no depthStencil', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createStarPointRenderer(mockDevice(renderPipelines), 'rgba16float');
    expect(renderPipelines).toHaveLength(1);
    const desc = renderPipelines[0]!;
    const target = Array.from(desc.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
    expect(target!.blend).toMatchObject({
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    });
    // The hdr target is depthless — declaring a depthStencil state would be
    // a validation error against a pass with no depth attachment.
    expect(desc.depthStencil).toBeUndefined();
  });

  it('instance layout stays byte-exact with starPoints/vertex.wesl — stride 28, offsets 0/12/24', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createStarPointRenderer(mockDevice(renderPipelines), 'rgba16float');
    const buffers = Array.from(renderPipelines[0]!.vertex.buffers!);
    expect(buffers).toHaveLength(1);
    const layout = buffers[0]!;
    expect(layout!.arrayStride).toBe(28);
    expect(layout!.stepMode).toBe('instance');
    expect(Array.from(layout!.attributes)).toEqual([
      { shaderLocation: 0, offset: 0, format: 'float32x3' },
      { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32' },
    ]);
  });
});
