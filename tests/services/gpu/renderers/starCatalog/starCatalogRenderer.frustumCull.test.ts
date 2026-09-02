/**
 * starCatalogRenderer — per-node frustum-cull behaviour.
 *
 * These tests exercise the pack loop's sphere-vs-frustum reject through the
 * PUBLIC draw path: they upload a tiny catalog, draw a two-node cut with real
 * frustum planes, and assert what reaches the mock pass — the ONE instanced
 * `pass.draw` and its instance count (the survivors' summed record counts). A
 * behavioural check on the drawn instance total, not the internal cursor: a
 * culled node must contribute NOTHING to the draw, and a node the cull cannot
 * prove out must survive intact.
 *
 * The planes come from `frustumPlanesFromViewProj` fed a REAL perspective
 * view-projection (Tasks 1–2 are trusted), with the eye AT the origin so the
 * rebased-frame convention matches production (camera at the frame origin →
 * node distance = `length(center)`). Verdicts are hand-reasoned from the
 * geometry: a node parked 50 units BEHIND the eye is unambiguously past the
 * near clip and must be dropped; a node 5 units in FRONT sits deep inside every
 * plane and must be kept.
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import { mat4 } from 'wgpu-matrix';

import { createStarCatalogRenderer } from '../../../../../src/services/gpu/renderers/starCatalog/starCatalogRenderer';
import { frustumPlanesFromViewProj } from '../../../../../src/utils/camera/frustumPlanesFromViewProj';
import { Source } from '../../../../../src/data/sources';
import type { StarCatalog } from '../../../../../src/@types/data/starCatalog/StarCatalog';
import type { StarCatalogDrawArgs } from '../../../../../src/@types/rendering/StarCatalogRenderer';

// A GPU device stub: every `create*` returns a plausibly-shaped stand-in and
// `queue.writeBuffer` is spied. Buffers carry their `label` so a test can prove
// which buffers were (or were NOT) written — the params/prefix labels are how
// we detect the zero-survivor early return skipping all GPU work.
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

// Frustum with the eye AT the origin looking down -z (matches the rebased
// camera-at-origin frame): 60° vertical FOV, square aspect, near 0.1 / far 100.
function originFrustum(): Float32Array {
  const proj = mat4.perspective(Math.PI / 3, 1, 0.1, 100);
  const view = mat4.lookAt([0, 0, 0], [0, 0, -1], [0, 1, 0]);
  const vp = mat4.multiply(proj, view) as Float32Array;
  return frustumPlanesFromViewProj(vp);
}

// A minimal committed catalog — `upload` only reads `.records` (repacked into
// the records storage buffer); `draw` reads none of the catalog, it walks the
// flat per-node arrays in the draw args. Eight records cover both nodes' slices.
const CATALOG = { records: new Uint8Array(8 * 6) } as unknown as StarCatalog;

// Node A: centre (0,0,-5), deep inside the frustum. Node B: centre (0,0,50),
// 50 units BEHIND the eye. Origin = centre − edge/2 (records span [origin,
// origin+edge)); edge 0.02 → box half-diagonal ≈ 0.017, far too small to reach
// the near clip from behind. A carries 3 records, B carries 5.
const A_RECORDS = 3;
const B_RECORDS = 5;
const HALF = 0.01;
function twoNodeArgs(
  frustumPlanes: Float32Array | null,
  overrides?: Partial<{ aZ: number; bZ: number }>,
): StarCatalogDrawArgs {
  const aZ = overrides?.aZ ?? -5;
  const bZ = overrides?.bZ ?? 50;
  return {
    source: Source.GaiaStars,
    stream: 'leaf',
    knee: true,
    vp: new Float32Array(16),
    viewportPx: [1280, 720],
    drawCount: 2,
    firstRecord: new Uint32Array([0, A_RECORDS]),
    recordCount: new Uint32Array([A_RECORDS, B_RECORDS]),
    // origin = centre − edge/2.
    originRelCamMpc: new Float32Array([-HALF, -HALF, aZ - HALF, -HALF, -HALF, bZ - HALF]),
    cellScaleMpc: new Float32Array([0.02, 0.02]),
    isAggregate: new Uint8Array([0, 0]),
    subtreeStarCount: new Float32Array([1, 1]),
    opacity: new Float32Array([1, 1]),
    sizePx: 2.5,
    brightness: 1,
    glowOverlap: 1,
    aggregateIntensityCap: 0.06,
    frustumPlanes,
    glowMarginAngleRad: 0.0001,
    viewSlot: 0,
  };
}

function wroteParamsOrPrefix(device: GPUDevice): boolean {
  return (device.queue.writeBuffer as unknown as Mock).mock.calls.some(([buf]) => {
    const label = (buf as { label?: string } | undefined)?.label;
    return typeof label === 'string' && (label.includes('node-params') || label.includes('prefix'));
  });
}

describe('starCatalogRenderer frustum cull', () => {
  it('culls a node whose sphere is fully outside the frustum', () => {
    const device = mockDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    renderer.upload(Source.GaiaStars, CATALOG);
    const pass = mockPass();

    renderer.draw(pass, twoNodeArgs(originFrustum()));

    // Node B (behind the eye) is dropped; only node A's records draw.
    expect(pass.draw).toHaveBeenCalledTimes(1);
    expect(pass.draw).toHaveBeenCalledWith(3, A_RECORDS);
  });

  it('null frustumPlanes draws every node', () => {
    const device = mockDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    renderer.upload(Source.GaiaStars, CATALOG);
    const pass = mockPass();

    renderer.draw(pass, twoNodeArgs(null));

    // Culling disabled → both nodes packed, instance total = both record counts.
    expect(pass.draw).toHaveBeenCalledTimes(1);
    expect(pass.draw).toHaveBeenCalledWith(3, A_RECORDS + B_RECORDS);
  });

  it('skips the draw entirely when all nodes are culled', () => {
    const device = mockDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    renderer.upload(Source.GaiaStars, CATALOG);
    const pass = mockPass();

    // Both nodes parked far behind the eye → every node culled.
    renderer.draw(pass, twoNodeArgs(originFrustum(), { aZ: 50, bZ: 60 }));

    expect(pass.draw).not.toHaveBeenCalled();
    // Zero survivors returns before any params/prefix upload — no GPU work.
    expect(wroteParamsOrPrefix(device)).toBe(false);
  });
});
