/**
 * bodyPickRenderer — the multi-caller `drawPoints` contract.
 *
 * Vitest runs in Node with no WebGPU surface, so `create*` returns plausibly
 * shaped stand-ins (mirrors `starPointRenderer.test.ts`). The load-bearing
 * behaviour pinned here is the NEW renderer capability: `drawPoints` is safe to
 * call MULTIPLE times in one pick pass (the scene stars AND the sub-pixel body
 * glints both call it), because each call claims its own per-pass SLOT of buffers.
 * A shared instance buffer would race `queue.writeBuffer` against submit — the
 * second caller's write would clobber the first's before the GPU ran either draw,
 * collapsing both point batches onto the last caller's data. This test proves the
 * two same-pass calls bind DIFFERENT instance buffers + bind groups (no clobber),
 * and that a fresh pass object resets the cursor so slot 0 is reused.
 */

import { describe, it, expect, vi } from 'vitest';
import { createBodyPickRenderer } from '../../../../../src/services/gpu/renderers/bodies/bodyPickRenderer';
import type { Renderer } from '../../../../../src/@types/rendering/Renderer';
import type { BodyPointPick } from '../../../../../src/@types/rendering/BodyPickRenderer';
import type { Vec2 } from '../../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

function mockDevice(): GPUDevice {
  return {
    limits: { minUniformBufferOffsetAlignment: 256 },
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    // Distinct object per call so buffer identity is observable — the whole point
    // of the multi-slot contract is that two same-pass calls touch DIFFERENT ones.
    createBuffer: vi.fn((desc: GPUBufferDescriptor) => ({ label: desc.label, destroy: vi.fn() })),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn((desc: GPUBindGroupDescriptor) => ({ label: desc.label })),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
}

function mockPass(): GPURenderPassEncoder {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    draw: vi.fn(),
    drawIndexed: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

const pt = (packedId: number, x: number): BodyPointPick => ({
  posRelCamMpc: [x, 0, 0] as Vec3,
  packedId,
});

const VP = new Float32Array(16);
const VIEWPORT: Vec2 = [1920, 1080];

describe('createBodyPickRenderer', () => {
  it('satisfies Renderer and destroys cleanly', () => {
    const renderer = createBodyPickRenderer(mockDevice());
    renderer satisfies Renderer;
    expect(renderer.label.length).toBeGreaterThan(0);
    expect(() => renderer.destroy()).not.toThrow();
  });
});

describe('bodyPickRenderer.drawPoints — multi-caller-per-pass', () => {
  it('two same-pass calls bind DIFFERENT instance buffers + bind groups (no last-write-wins clobber)', () => {
    const device = mockDevice();
    const renderer = createBodyPickRenderer(device);
    const pass = mockPass();

    // Caller A: one point (the scene stars). Caller B: two points (the glints).
    renderer.drawPoints(pass, { vp: VP, viewportPx: VIEWPORT, points: [pt(100, 1)] });
    renderer.drawPoints(pass, {
      vp: VP,
      viewportPx: VIEWPORT,
      points: [pt(200, 2), pt(300, 3)],
    });

    // Both draws recorded, each with its OWN instance count (not the last-write
    // count twice, which is the symptom of a shared-buffer clobber).
    const draw = pass.draw as unknown as ReturnType<typeof vi.fn>;
    expect(draw).toHaveBeenCalledTimes(2);
    expect(draw).toHaveBeenNthCalledWith(1, 6, 1);
    expect(draw).toHaveBeenNthCalledWith(2, 6, 2);

    // Different instance buffers bound → the second call did not overwrite the
    // first call's buffer bytes.
    const setVbo = pass.setVertexBuffer as unknown as ReturnType<typeof vi.fn>;
    const vboA = setVbo.mock.calls[0]![1];
    const vboB = setVbo.mock.calls[1]![1];
    expect(vboA).not.toBe(vboB);

    // Different bind groups → each call reads its OWN camera uniform buffer.
    const setBg = pass.setBindGroup as unknown as ReturnType<typeof vi.fn>;
    const bgA = setBg.mock.calls[0]![1];
    const bgB = setBg.mock.calls[1]![1];
    expect(bgA).not.toBe(bgB);

    // Each call wrote its OWN interleaved instance buffer (no shared write).
    const writeBuffer = device.queue.writeBuffer as unknown as ReturnType<typeof vi.fn>;
    const instanceWrites = writeBuffer.mock.calls.filter(([buffer]) =>
      (buffer as { label?: string }).label?.startsWith('body-pick-point-instance-vbo'),
    );
    expect(instanceWrites).toHaveLength(2);
    expect((instanceWrites[0]![0] as { label?: string }).label).not.toBe(
      (instanceWrites[1]![0] as { label?: string }).label,
    );
  });

  it('a fresh pass resets the cursor — slot 0 is reused, not reallocated', () => {
    const device = mockDevice();
    const renderer = createBodyPickRenderer(device);

    const passOne = mockPass();
    renderer.drawPoints(passOne, { vp: VP, viewportPx: VIEWPORT, points: [pt(100, 1)] });
    const firstVbo = (passOne.setVertexBuffer as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]![1];

    // A new pass object marks a fresh submit: the cursor resets to 0, so the next
    // drawPoints reuses slot 0's buffers (same count ≤ capacity → no realloc).
    const passTwo = mockPass();
    renderer.drawPoints(passTwo, { vp: VP, viewportPx: VIEWPORT, points: [pt(999, 9)] });
    const reusedVbo = (passTwo.setVertexBuffer as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]![1];

    expect(reusedVbo).toBe(firstVbo);
  });

  it('an empty batch is a no-op that costs no slot', () => {
    const device = mockDevice();
    const renderer = createBodyPickRenderer(device);
    const pass = mockPass();

    // Empty first call must NOT advance the cursor, so the following non-empty
    // call still lands in slot 0 (a fresh renderer's first real slot).
    renderer.drawPoints(pass, { vp: VP, viewportPx: VIEWPORT, points: [] });
    renderer.drawPoints(pass, { vp: VP, viewportPx: VIEWPORT, points: [pt(1, 1)] });

    const draw = pass.draw as unknown as ReturnType<typeof vi.fn>;
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenNthCalledWith(1, 6, 1);
  });
});
