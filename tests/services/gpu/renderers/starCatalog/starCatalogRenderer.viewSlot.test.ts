/**
 * starCatalogRenderer — view-slot isolation (Task 13b).
 *
 * A sky-cubemap capture sweep calls `draw()` several times per frame — one
 * per requested face plus once for the real view — all before the frame's
 * single `submit()`. Each call carries a different camera and (for the
 * SAME source + stream) a different octree cut. These tests pin the fix for
 * the writeBuffer/submit race (docs/RENDERER.md landmine #1): two `draw()`
 * calls with different `viewSlot` must land their camera uniform AND their
 * NodeParams/prefix pair in DIFFERENT GPU buffers, never the same one.
 */

import { describe, it, expect, vi } from 'vitest';

import { createStarCatalogRenderer } from '../../../../../src/services/gpu/renderers/starCatalog/starCatalogRenderer';
import { Source } from '../../../../../src/data/sources';
import type { StarCatalog } from '../../../../../src/@types/data/starCatalog/StarCatalog';
import type { StarCatalogDrawArgs } from '../../../../../src/@types/rendering/StarCatalogRenderer';

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

const CATALOG = { records: new Uint8Array(2 * 6) } as unknown as StarCatalog;

function oneNodeArgs(viewSlot: number): StarCatalogDrawArgs {
  return {
    source: Source.GaiaStars,
    stream: 'leaf',
    vp: new Float32Array(16),
    viewportPx: [1280, 720],
    drawCount: 1,
    firstRecord: new Uint32Array([0]),
    recordCount: new Uint32Array([2]),
    originRelCamMpc: new Float32Array([0, 0, -5]),
    cellScaleMpc: new Float32Array([0.02]),
    isAggregate: new Uint8Array([0]),
    subtreeStarCount: new Float32Array([1]),
    opacity: new Float32Array([1]),
    sizePx: 2.5,
    brightness: 1,
    glowOverlap: 1,
    aggregateIntensityCap: 0.06,
    frustumPlanes: null,
    glowMarginAngleRad: 0,
    viewSlot,
  };
}

describe('starCatalogRenderer viewSlot isolation', () => {
  it('two draw() calls with different viewSlot bind different @group(0) camera buffers', () => {
    const device = mockDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    renderer.upload(Source.GaiaStars, CATALOG);

    const bindGroupsAt0: unknown[] = [];
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: (slot: number, bg: unknown) => {
        if (slot === 0) bindGroupsAt0.push(bg);
      },
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    // A sky-cubemap capture sweep: two faces, same source, same frame,
    // before one submit().
    renderer.draw(pass, oneNodeArgs(1));
    renderer.draw(pass, oneNodeArgs(2));

    expect(bindGroupsAt0).toHaveLength(2);
    expect(bindGroupsAt0[0]).not.toBe(bindGroupsAt0[1]);
  });

  it('two draw() calls with different viewSlot write the camera uniform into different physical buffers', () => {
    const device = mockDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    renderer.upload(Source.GaiaStars, CATALOG);

    renderer.draw(mockPass(), oneNodeArgs(1));
    renderer.draw(mockPass(), oneNodeArgs(2));

    const writeBuffer = device.queue.writeBuffer as unknown as ReturnType<typeof vi.fn>;
    const cameraWrites = writeBuffer.mock.calls.filter(
      ([buf]) =>
        (buf as { label?: string }).label === 'star-catalog-camera-uniform-slot1' ||
        (buf as { label?: string }).label === 'star-catalog-camera-uniform-slot2',
    );
    expect(cameraWrites).toHaveLength(2);
    // Distinct buffer objects — slot 2's write never touched slot 1's buffer.
    expect(cameraWrites[0]![0]).not.toBe(cameraWrites[1]![0]);
  });

  it('two draw() calls with different viewSlot allocate different NodeParams/prefix buffer pairs for the SAME source', () => {
    const device = mockDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    renderer.upload(Source.GaiaStars, CATALOG);

    renderer.draw(mockPass(), oneNodeArgs(1));
    renderer.draw(mockPass(), oneNodeArgs(2));

    const createBuffer = device.createBuffer as unknown as ReturnType<typeof vi.fn>;
    const nodeParamsCreates = createBuffer.mock.calls.filter(([desc]) =>
      (desc as GPUBufferDescriptor).label?.includes('leaf-node-params'),
    );
    const prefixCreates = createBuffer.mock.calls.filter(([desc]) =>
      (desc as GPUBufferDescriptor).label?.includes('leaf-prefix'),
    );
    // One pair allocated per view slot — a shared pair would allocate once
    // and just re-write it, which is exactly the race this closes.
    expect(nodeParamsCreates.length).toBeGreaterThanOrEqual(2);
    expect(prefixCreates.length).toBeGreaterThanOrEqual(2);
  });
});
