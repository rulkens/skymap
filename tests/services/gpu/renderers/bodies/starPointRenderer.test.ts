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
import { createStarPointRenderer } from '../../../../../src/services/gpu/renderers/bodies/starPointRenderer';
import type { Renderer } from '../../../../../src/@types/rendering/Renderer';
import type { PositionedStar } from '../../../../../src/@types/scene/PositionedStar';

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

const SUN: PositionedStar = {
  id: 'sun',
  label: 'Sun',
  positionMpc: [0, 0, 0],
  absMag: 4.83,
  color: [1, 0.95, 0.85],
  radiusM: 695700000,
};

const SIRIUS: PositionedStar = {
  id: 'sirius',
  label: 'Sirius',
  positionMpc: [1.6e-6, 2.1e-6, -0.4e-6],
  absMag: 1.43,
  color: [0.75, 0.85, 1],
  radiusM: 1189600000,
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

  const DRAW_OPTS = { sizePx: 2.5, brightness: 1, viewSlot: 0 };

  it('setStars and draw are callable with the right arity', () => {
    const renderer = createStarPointRenderer(mockDevice(), 'rgba16float');
    expect(typeof renderer.setStars).toBe('function');
    expect(renderer.setStars.length).toBe(2);
    expect(typeof renderer.draw).toBe('function');
    expect(renderer.draw.length).toBe(4);
  });

  it('draw is a no-op before setStars, draws 6×N after, and clears on empty upload', () => {
    const renderer = createStarPointRenderer(mockDevice(), 'rgba16float');

    // Late binding: nothing uploaded yet — no draw call recorded.
    const before = mockPass();
    expect(() =>
      renderer.draw(before, new Float32Array(16), [1920, 1080], DRAW_OPTS),
    ).not.toThrow();
    expect(before.draw).not.toHaveBeenCalled();

    // Two stars uploaded — one instanced draw of 6 vertices × 2 instances.
    renderer.setStars([SUN, SIRIUS], 0);
    const after = mockPass();
    renderer.draw(after, new Float32Array(16), [1920, 1080], DRAW_OPTS);
    expect(after.draw).toHaveBeenCalledTimes(1);
    expect(after.draw).toHaveBeenCalledWith(6, 2);

    // Empty upload clears the renderer back to the no-op state.
    renderer.setStars([], 0);
    const cleared = mockPass();
    renderer.draw(cleared, new Float32Array(16), [1920, 1080], DRAW_OPTS);
    expect(cleared.draw).not.toHaveBeenCalled();
  });

  it('writes sizePx / brightness into the uniform tail at floats 20 / 21, buffer sized 96', () => {
    const device = mockDevice();
    const renderer = createStarPointRenderer(device, 'rgba16float');
    const createBuffer = device.createBuffer as unknown as ReturnType<typeof vi.fn>;
    const writeBuffer = device.queue.writeBuffer as unknown as ReturnType<typeof vi.fn>;

    // The StarPointUniforms buffer is the CameraUniforms prefix (80 B) plus the
    // sizePx / brightness tail rounded to 96 B — must match starPoints/io.wesl.
    // One physical buffer per view slot (Task 13b); slot 0's is checked here.
    const uniformCreate = createBuffer.mock.calls.find(
      ([desc]) => (desc as GPUBufferDescriptor).label === 'star-points-uniform-slot0',
    );
    expect((uniformCreate![0] as GPUBufferDescriptor).size).toBe(96);

    renderer.setStars([SUN, SIRIUS], 0);
    renderer.draw(mockPass(), new Float32Array(16), [1920, 1080], {
      sizePx: 3.5,
      brightness: 42,
      viewSlot: 0,
    });

    const uniformWrite = writeBuffer.mock.calls.find(
      ([buffer]) => (buffer as { label?: string }).label === 'star-points-uniform-slot0',
    );
    const scratch = uniformWrite![2] as Float32Array;
    // sizePx at float 20 (byte 80), brightness at float 21 (byte 84); the pad
    // floats 22..23 stay zero.
    expect(scratch[20]).toBe(3.5);
    expect(scratch[21]).toBe(42);
    expect(scratch[22]).toBe(0);
    expect(scratch[23]).toBe(0);
  });

  it('reuses the instance buffer across same-length setStars — one createBuffer, one writeBuffer per upload', () => {
    const device = mockDevice();
    const renderer = createStarPointRenderer(device, 'rgba16float');

    const createBuffer = device.createBuffer as unknown as ReturnType<typeof vi.fn>;
    const writeBuffer = device.queue.writeBuffer as unknown as ReturnType<typeof vi.fn>;

    const instanceCreates = () =>
      createBuffer.mock.calls.filter(
        ([desc]) => (desc as GPUBufferDescriptor).label === 'star-points-instance-buffer-slot0',
      ).length;
    const instanceUploads = () =>
      writeBuffer.mock.calls.filter(
        ([buffer]) => (buffer as { label?: string }).label === 'star-points-instance-buffer-slot0',
      ).length;

    // Per-frame `starPointsLayer.draw` re-hands camera-relative anchors each
    // frame, so `setStars` fires every frame with the same star count. That
    // must NOT churn a fresh GPU buffer per call: allocate once, re-upload.
    renderer.setStars([SUN, SIRIUS], 0);
    renderer.setStars([SUN, SIRIUS], 0);

    expect(instanceCreates()).toBe(1);
    expect(instanceUploads()).toBe(2);
  });

  it('viewSlot — two draw() calls with different viewSlot land their camera uniform in different buffers', () => {
    const device = mockDevice();
    const renderer = createStarPointRenderer(device, 'rgba16float');
    const writeBuffer = device.queue.writeBuffer as unknown as ReturnType<typeof vi.fn>;

    // Two "faces" of a capture sweep, each with its own star set and camera,
    // both drawn before the frame's single submit — the writeBuffer/submit
    // race `viewSlot` exists to close (docs/RENDERER.md landmine #1).
    renderer.setStars([SUN], 1);
    renderer.setStars([SIRIUS], 2);
    renderer.draw(mockPass(), new Float32Array(16), [256, 256], {
      sizePx: 2.5,
      brightness: 1,
      viewSlot: 1,
    });
    renderer.draw(mockPass(), new Float32Array(16), [256, 256], {
      sizePx: 2.5,
      brightness: 1,
      viewSlot: 2,
    });

    const uniformSlot1 = writeBuffer.mock.calls.find(
      ([buffer]) => (buffer as { label?: string }).label === 'star-points-uniform-slot1',
    );
    const uniformSlot2 = writeBuffer.mock.calls.find(
      ([buffer]) => (buffer as { label?: string }).label === 'star-points-uniform-slot2',
    );
    // Distinct GPU buffer objects — slot 2's write never touched slot 1's.
    expect(uniformSlot1![0]).not.toBe(uniformSlot2![0]);

    const instanceSlot1 = device.createBuffer as unknown as ReturnType<typeof vi.fn>;
    const slot1Label = instanceSlot1.mock.calls.find(
      ([desc]) => (desc as GPUBufferDescriptor).label === 'star-points-instance-buffer-slot1',
    );
    const slot2Label = instanceSlot1.mock.calls.find(
      ([desc]) => (desc as GPUBufferDescriptor).label === 'star-points-instance-buffer-slot2',
    );
    expect(slot1Label).toBeDefined();
    expect(slot2Label).toBeDefined();
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
