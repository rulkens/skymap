/**
 * starCatalogPickRenderer — per-node frustum-cull behaviour (the pick twin of
 * `starCatalogRenderer.frustumCull.test.ts`).
 *
 * These tests exercise the pick pack loop's sphere-vs-frustum reject through the
 * PUBLIC draw path: they draw a two-leaf cut with real frustum planes and assert
 * what reaches the mock pass — the ONE instanced `pass.draw` and its instance
 * count (the survivors' summed record counts). A behavioural check on the drawn
 * instance total: a culled leaf must contribute NOTHING to the pick draw, and a
 * leaf the cull cannot prove out must survive intact. The pick path is leaf-only
 * (`isAggregate` packed 0 for every node), so only the leaf branch of the
 * cull-radius contract runs — no aggregate glow slack.
 *
 * The planes come from `frustumPlanesFromViewProj` fed a REAL perspective
 * view-projection (Tasks 1–2 are trusted), with the eye AT the origin so the
 * rebased-frame convention matches production (camera at the frame origin →
 * node distance = `length(center)`). Verdicts are hand-reasoned from the
 * geometry: a leaf parked 50 units BEHIND the eye is unambiguously past the near
 * clip and must be dropped; a leaf 5 units in FRONT sits deep inside every plane
 * and must be kept.
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import { mat4 } from 'wgpu-matrix';

import { createStarCatalogPickRenderer } from '../../../../../src/services/gpu/renderers/starCatalog/starCatalogPickRenderer';
import { frustumPlanesFromViewProj } from '../../../../../src/utils/camera/frustumPlanesFromViewProj';
import { Source } from '../../../../../src/data/sources';
import type { StarCatalogPickResources } from '../../../../../src/@types/rendering/StarCatalogRenderer';
import type { StarCatalogPickDrawArgs } from '../../../../../src/@types/rendering/StarCatalogPickRenderer';

// A GPU device stub: every `create*` returns a plausibly-shaped stand-in and
// `queue.writeBuffer` is spied. Buffers carry their `label` so a test can prove
// which buffers were (or were NOT) written — the pick params/prefix labels are
// how we detect the zero-survivor early return skipping all GPU work.
function mockDevice(): GPUDevice {
  return {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBuffer: vi.fn((desc: GPUBufferDescriptor) => ({ label: desc.label, destroy: vi.fn() })),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
}

function mockPass(): GPURenderPassEncoder {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

// The shared resources the visual renderer hands the pick renderer: three BGLs
// (opaque stand-ins here) plus a per-source records bind group. A non-null bind
// group for Gaia stars is what makes `draw` proceed past its records guard.
function mockResources(): StarCatalogPickResources {
  return {
    cameraBgl: {} as GPUBindGroupLayout,
    drawBgl: {} as GPUBindGroupLayout,
    recordsBgl: {} as GPUBindGroupLayout,
    recordsBindGroup: (source) => (source === Source.GaiaStars ? ({} as GPUBindGroup) : null),
  };
}

// Frustum with the eye AT the origin looking down -z (matches the rebased
// camera-at-origin frame): 60° vertical FOV, square aspect, near 0.1 / far 100.
function originFrustum(): Float32Array {
  const proj = mat4.perspective(Math.PI / 3, 1, 0.1, 100);
  const view = mat4.lookAt([0, 0, 0], [0, 0, -1], [0, 1, 0]);
  const vp = mat4.multiply(proj, view) as Float32Array;
  return frustumPlanesFromViewProj(vp);
}

// Leaf A: centre (0,0,-5), deep inside the frustum. Leaf B: centre (0,0,50), 50
// units BEHIND the eye. Origin = centre − edge/2 (records span [origin,
// origin+edge)); edge 0.02 → box half-diagonal ≈ 0.017, far too small to reach
// the near clip from behind. A carries 3 records, B carries 5.
const A_RECORDS = 3;
const B_RECORDS = 5;
const HALF = 0.01;
function twoLeafArgs(
  frustumPlanes: Float32Array | null,
  overrides?: Partial<{ aZ: number; bZ: number }>,
): StarCatalogPickDrawArgs {
  const aZ = overrides?.aZ ?? -5;
  const bZ = overrides?.bZ ?? 50;
  return {
    source: Source.GaiaStars,
    vp: new Float32Array(16),
    viewportPx: [1280, 720],
    drawCount: 2,
    firstRecord: new Uint32Array([0, A_RECORDS]),
    recordCount: new Uint32Array([A_RECORDS, B_RECORDS]),
    // origin = centre − edge/2.
    originRelCamMpc: new Float32Array([-HALF, -HALF, aZ - HALF, -HALF, -HALF, bZ - HALF]),
    cellScaleMpc: new Float32Array([0.02, 0.02]),
    sizePx: 2.5,
    frustumPlanes,
    glowMarginAngleRad: 0.0001,
  };
}

function wroteParamsOrPrefix(device: GPUDevice): boolean {
  return (device.queue.writeBuffer as unknown as Mock).mock.calls.some(([buf]) => {
    const label = (buf as { label?: string } | undefined)?.label;
    return typeof label === 'string' && (label.includes('node-params') || label.includes('prefix'));
  });
}

describe('starCatalogPickRenderer frustum cull', () => {
  it('culls a leaf node outside the frustum', () => {
    const device = mockDevice();
    const renderer = createStarCatalogPickRenderer(device, mockResources(), true);
    const pass = mockPass();

    renderer.draw(pass, twoLeafArgs(originFrustum()));

    // Leaf B (behind the eye) is dropped; only leaf A's records draw.
    expect(pass.draw).toHaveBeenCalledTimes(1);
    expect(pass.draw).toHaveBeenCalledWith(3, A_RECORDS);
  });

  it('null frustumPlanes picks every node', () => {
    const device = mockDevice();
    const renderer = createStarCatalogPickRenderer(device, mockResources(), true);
    const pass = mockPass();

    renderer.draw(pass, twoLeafArgs(null));

    // Culling disabled → both leaves packed, instance total = both record counts.
    expect(pass.draw).toHaveBeenCalledTimes(1);
    expect(pass.draw).toHaveBeenCalledWith(3, A_RECORDS + B_RECORDS);
  });

  it('skips the pick draw when all nodes are culled', () => {
    const device = mockDevice();
    const renderer = createStarCatalogPickRenderer(device, mockResources(), true);
    const pass = mockPass();

    // Both leaves parked far behind the eye → every node culled.
    renderer.draw(pass, twoLeafArgs(originFrustum(), { aZ: 50, bZ: 60 }));

    expect(pass.draw).not.toHaveBeenCalled();
    // Zero survivors returns before any params/prefix upload — no GPU work.
    expect(wroteParamsOrPrefix(device)).toBe(false);
  });
});
