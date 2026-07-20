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
import type {
  BodyPointPick,
  BodyGlintPick,
} from '../../../../../src/@types/rendering/BodyPickRenderer';
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
    // Surface the descriptor label so the two point pipelines (scene-star vs
    // glint) are distinguishable by the variant test.
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => ({ label: desc.label })),
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

const gpt = (packedId: number, x: number, bandClass: number): BodyGlintPick => ({
  posRelCamMpc: [x, 0, 0] as Vec3,
  packedId,
  bandClass,
});

const VP = new Float32Array(16);
const VIEWPORT: Vec2 = [1920, 1080];

describe('createBodyPickRenderer', () => {
  it('satisfies Renderer and destroys cleanly', () => {
    const renderer = createBodyPickRenderer(mockDevice(), false);
    renderer satisfies Renderer;
    expect(renderer.label.length).toBeGreaterThan(0);
    expect(() => renderer.destroy()).not.toThrow();
  });
});

describe('bodyPickRenderer.drawPoints — multi-caller-per-pass', () => {
  it('two same-pass calls bind DIFFERENT instance buffers + bind groups (no last-write-wins clobber)', () => {
    const device = mockDevice();
    const renderer = createBodyPickRenderer(device, false);
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
    const renderer = createBodyPickRenderer(device, false);

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

  it('selects the glint pipeline for variant "glint", the scene-star pipeline by default', () => {
    const device = mockDevice();
    const renderer = createBodyPickRenderer(device, false);
    const pass = mockPass();

    // Default variant → scene-star point pipeline (clamps true depth).
    renderer.drawPoints(pass, { vp: VP, viewportPx: VIEWPORT, points: [pt(1, 1)] });
    // Explicit glint variant → the glint pipeline (forces the shallow glint band).
    renderer.drawPoints(pass, {
      vp: VP,
      viewportPx: VIEWPORT,
      points: [gpt(2, 2, 1)],
      variant: 'glint',
    });

    const setPipeline = pass.setPipeline as unknown as ReturnType<typeof vi.fn>;
    const first = setPipeline.mock.calls[0]![0] as { label?: string };
    const second = setPipeline.mock.calls[1]![0] as { label?: string };
    // Two DIFFERENT pipeline objects — a shared pipeline would ignore the variant
    // and both point classes would sort by the same depth rule.
    expect(first).not.toBe(second);
    expect(first.label).toBe('body-pick-point-pipeline');
    expect(second.label).toBe('body-pick-point-glint-pipeline');
  });

  it('reuses a slot across a stride change and reallocates to the wider byte size (byte-aware capacity)', () => {
    // Slots are keyed by CALL ORDER (pointCursor), not by caller: when
    // starPointsLayer drops out of a pass (famous-stars toggle off / roster all
    // spheres), bodyGlintsLayer becomes the FIRST point caller and inherits slot 0
    // — a slot last sized for 16-byte scene-star instances. A count-only reuse
    // check keeps that 16-byte buffer for the wider 20-byte glints whenever the
    // count fits (n <= capacity), and writeBuffer then runs past the buffer end (a
    // WebGPU validation error that silently drops the whole pick pass). A
    // byte-aware capacity must reallocate on the stride change.
    const device = mockDevice();
    const renderer = createBodyPickRenderer(device, false);
    const N = 2;

    // Pass 1: the scene-star variant claims slot 0 at 16 bytes/instance (32 total).
    const passOne = mockPass();
    renderer.drawPoints(passOne, {
      vp: VP,
      viewportPx: VIEWPORT,
      points: [pt(1, 1), pt(2, 2)],
    });

    // Pass 2 (fresh pass → cursor resets to slot 0): the GLINT variant inherits
    // slot 0 with the SAME instance count but a WIDER 20-byte stride (40 total).
    const glintPoints: BodyGlintPick[] = [
      { posRelCamMpc: [1, 0, 0] as Vec3, packedId: 1, bandClass: 1 },
      { posRelCamMpc: [2, 0, 0] as Vec3, packedId: 2, bandClass: 2 },
    ];
    const passTwo = mockPass();
    renderer.drawPoints(passTwo, {
      vp: VP,
      viewportPx: VIEWPORT,
      points: glintPoints,
      variant: 'glint',
    });

    const createBuffer = device.createBuffer as unknown as ReturnType<typeof vi.fn>;
    const instanceAllocs = createBuffer.mock.calls
      .map(([desc]) => desc as GPUBufferDescriptor)
      .filter((desc) => desc.label?.startsWith('body-pick-point-instance-vbo'));
    // Two allocations for the same slot 0: the 16-byte scene-star sizing, then the
    // wider glint reallocation. Count-only reuse would skip the second (n <= cap).
    expect(instanceAllocs).toHaveLength(2);
    expect(instanceAllocs[instanceAllocs.length - 1]!.size).toBeGreaterThanOrEqual(N * 20);
  });

  it('the glint variant packs a 20-byte instance stride carrying each point bandClass', () => {
    // The glint pipeline reads a third `bandClass` u32 (offset 16), so its instance
    // stride is 20 bytes — 4 more than the scene-star 16. This proves the layer
    // packs the wider stride AND writes each point's class at word 4, the datum
    // vsGlint maps to its pick-depth band. A default-variant call (16 bytes) would
    // leave no room for the class and the priority would collapse.
    const device = mockDevice();
    const renderer = createBodyPickRenderer(device, false);
    const pass = mockPass();

    const points: BodyGlintPick[] = [
      { posRelCamMpc: [1, 0, 0] as Vec3, packedId: 10, bandClass: 0 }, // earth
      { posRelCamMpc: [2, 0, 0] as Vec3, packedId: 20, bandClass: 2 }, // moon
    ];
    renderer.drawPoints(pass, { vp: VP, viewportPx: VIEWPORT, points, variant: 'glint' });

    // The glint pipeline was selected.
    const setPipeline = pass.setPipeline as unknown as ReturnType<typeof vi.fn>;
    expect((setPipeline.mock.calls[0]![0] as { label?: string }).label).toBe(
      'body-pick-point-glint-pipeline',
    );

    // The interleaved instance buffer is 2 × 20 bytes, and each 5-word record
    // carries packedId at word 3 and bandClass at word 4.
    const writeBuffer = device.queue.writeBuffer as unknown as ReturnType<typeof vi.fn>;
    const instWrite = writeBuffer.mock.calls.find(([buffer]) =>
      (buffer as { label?: string }).label?.startsWith('body-pick-point-instance-vbo'),
    )!;
    const data = instWrite[2] as ArrayBuffer;
    expect(data.byteLength).toBe(2 * 20);
    const u32 = new Uint32Array(data);
    expect(u32[3]).toBe(10); // point 0 packedId
    expect(u32[4]).toBe(0); //  point 0 bandClass (earth)
    expect(u32[8]).toBe(20); // point 1 packedId (word 5+3)
    expect(u32[9]).toBe(2); //  point 1 bandClass (moon)
  });

  it('the scene-star (default) variant packs the narrower 16-byte instance stride', () => {
    // The default pipeline has no bandClass attribute, so its stride stays 16: one
    // point → a 16-byte buffer, not 20. Guards against the glint stride leaking
    // into the scene-star path (which would misalign every famous-star pick).
    const device = mockDevice();
    const renderer = createBodyPickRenderer(device, false);
    const pass = mockPass();

    renderer.drawPoints(pass, { vp: VP, viewportPx: VIEWPORT, points: [pt(7, 1)] });

    const writeBuffer = device.queue.writeBuffer as unknown as ReturnType<typeof vi.fn>;
    const instWrite = writeBuffer.mock.calls.find(([buffer]) =>
      (buffer as { label?: string }).label?.startsWith('body-pick-point-instance-vbo'),
    )!;
    expect((instWrite[2] as ArrayBuffer).byteLength).toBe(16);
  });

  it('an empty batch is a no-op that costs no slot', () => {
    const device = mockDevice();
    const renderer = createBodyPickRenderer(device, false);
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
