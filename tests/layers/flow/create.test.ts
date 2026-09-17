/**
 * create — mints a non-null renderer and a slot whose commit closes over it
 * directly (Task 3's whole point: no `state.gpu` reach, no `?.` guard). The
 * fetcher is mocked so `slot.load` exercises the real commit without a
 * network round-trip, mirroring `volumeSlotIngest.test.ts`'s idiom.
 */
import { describe, it, expect, vi } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('../../../src/layers/flow/load/flowFieldFetcher', () => ({
  flowFieldFetcher: mockFetch,
}));

import { create } from '../../../src/layers/flow/create';
import type { LayerCoreDeps } from '../../../src/@types/engine/layer/LayerCoreDeps';
import type { ScalarCube } from '../../../src/@types/data/volume/ScalarCube';

/** Minimal GPUDevice mock — construction-only, mirrors flowFieldRenderer.test.ts. */
function mockDevice(): GPUDevice {
  return {
    createTexture: vi.fn(() => ({ createView: vi.fn(() => ({})), destroy: vi.fn() })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createSampler: vi.fn(() => ({})),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createComputePipeline: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: vi.fn(() => ({})) })),
    createBindGroup: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn(), writeTexture: vi.fn() },
  } as unknown as GPUDevice;
}

function mockCube(): ScalarCube {
  return {
    dims: [4, 4, 4],
    channels: 4,
    voxels: new Uint16Array(4 * 4 * 4 * 4),
    frameKind: 'equatorial-cartesian',
    origin: [-100, -100, -100],
    voxelSize: 50,
    rotation: [0, 0, 0, 1],
    valueMin: 0,
    valueMax: 1,
    velocityStats: { speedKmsMax: 1, speedKmsP99: 1, deltaP99: 1 },
  } as unknown as ScalarCube;
}

describe('flow create', () => {
  it('mints a non-null renderer and a slot whose commit uploads into it', async () => {
    const deps = { ctx: { device: mockDevice() } } as unknown as LayerCoreDeps;
    const runtime = create(deps);
    expect(runtime.renderer).not.toBeNull();
    expect(runtime.slot).not.toBeNull();

    const cube = mockCube();
    mockFetch.mockResolvedValue(cube);
    const uploadSpy = vi.spyOn(runtime.renderer, 'upload');

    runtime.slot.load(undefined as never);
    await vi.waitFor(() => expect(runtime.slot.state().kind).toBe('ready'));

    // The slot's own renderer, not a second copy reached via `state.gpu` —
    // there is no `state` argument for it to reach through.
    expect(uploadSpy).toHaveBeenCalledWith(cube);
    expect(runtime.renderer.fieldLoaded()).toBe(true);
  });
});
