/**
 * starCatalogRenderer — view-slot isolation.
 *
 * A sky-cubemap capture sweep calls `drawCut()` several times per frame — one
 * per face plus the real view — all before the frame's single `submit()`, each
 * with a different camera. Two calls with different `viewSlot` must land their
 * camera uniform in DIFFERENT GPU buffers (docs/RENDERER.md landmine #1: a
 * shared buffer hands every draw the last write).
 */

import { describe, it, expect, vi } from 'vitest';

import { createStarCatalogRenderer } from '../../../../src/layers/starCatalog/render/starCatalogRenderer';
import { Source } from '../../../../src/data/sources';
import type { StarCatalog } from '../../../../src/@types/data/starCatalog/StarCatalog';
import type { StarCatalogCutDrawArgs } from '../../../../src/layers/starCatalog/@types/StarCatalogCutDrawArgs';

// The cut's own GPU resources are not under test; stub it to always have a list.
vi.mock('../../../../src/layers/starCatalog/render/starCutGpu', () => ({
  createStarCutGpu: () => ({
    drawBgl: {},
    upload: vi.fn(),
    drawOf: () => ({ bindGroup: {}, indirect: {}, indirectOffset: 0 }),
    submitCapture: vi.fn(),
    encode: vi.fn(),
    destroy: vi.fn(),
  }),
}));

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

const CATALOG = { records: new Uint8Array(2 * 6) } as unknown as StarCatalog;

function args(viewSlot: number): StarCatalogCutDrawArgs {
  return {
    source: Source.GaiaStars,
    stream: 'leaf',
    capture: false,
    knee: true,
    vp: new Float32Array(16),
    viewportPx: [1280, 720],
    pxPerRad: 623.5,
    sizePx: 2.5,
    brightness: 1,
    glowOverlap: 1,
    aggregateIntensityCap: 0.06,
    viewSlot,
  };
}

describe('starCatalogRenderer viewSlot isolation', () => {
  it('two drawCut() calls with different viewSlot bind different @group(0) camera buffers', () => {
    const renderer = createStarCatalogRenderer(mockDevice(), 'rgba16float');
    renderer.upload(Source.GaiaStars, CATALOG);

    const bindGroupsAt0: unknown[] = [];
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: (slot: number, bg: unknown) => {
        if (slot === 0) bindGroupsAt0.push(bg);
      },
      drawIndirect: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    renderer.drawCut(pass, args(1));
    renderer.drawCut(pass, args(2));

    expect(bindGroupsAt0).toHaveLength(2);
    expect(bindGroupsAt0[0]).not.toBe(bindGroupsAt0[1]);
  });

  it('writes each slot camera uniform into a different physical buffer', () => {
    const device = mockDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    renderer.upload(Source.GaiaStars, CATALOG);
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      drawIndirect: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    renderer.drawCut(pass, args(1));
    renderer.drawCut(pass, args(2));

    const writeBuffer = device.queue.writeBuffer as unknown as ReturnType<typeof vi.fn>;
    const cameraWrites = writeBuffer.mock.calls.filter(([buf]) =>
      (buf as { label?: string }).label?.startsWith('star-catalog-camera-uniform-'),
    );
    expect(cameraWrites).toHaveLength(2);
    expect(cameraWrites[0]![0]).not.toBe(cameraWrites[1]![0]);
  });

  it('the leaf and aggregate streams of one view slot write different camera buffers', () => {
    const device = mockDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    renderer.upload(Source.GaiaStars, CATALOG);
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      drawIndirect: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    renderer.drawCut(pass, { ...args(0), stream: 'aggregate', viewportPx: [640, 360] });
    renderer.drawCut(pass, args(0));

    const writeBuffer = device.queue.writeBuffer as unknown as ReturnType<typeof vi.fn>;
    const cameraWrites = writeBuffer.mock.calls.filter(([buf]) =>
      (buf as { label?: string }).label?.startsWith('star-catalog-camera-uniform-'),
    );
    expect(cameraWrites).toHaveLength(2);
    expect(cameraWrites[0]![0]).not.toBe(cameraWrites[1]![0]);
  });
});
