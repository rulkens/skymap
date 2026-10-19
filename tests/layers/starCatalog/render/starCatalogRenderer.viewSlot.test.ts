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
import { STAR_FOCUS_AT_REST } from '../../../fixtures/starFocusAtRest';
import type { StarOctree } from '../../../../src/@types/data/starCatalog/StarOctree';
import type { StarCatalogCutDrawArgs } from '../../../../src/layers/starCatalog/@types/StarCatalogCutDrawArgs';
import {
  BOOST_FLOAT_INDEX,
  STAR_UNIFORM_BYTES,
} from '../../../../src/layers/starCatalog/render/starCatalogLayout';

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
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => ({ label: desc.label })),
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
}

const CATALOG = {
  records: {
    count: 2,
    offset: new Uint16Array(6),
    absMag: new Float32Array(2),
    colourIndex: new Float32Array(2),
  },
  chunks: [],
  chunkCount: 0,
  chunkCapacity: 0,
} as unknown as StarOctree;

function args(viewSlot: number): StarCatalogCutDrawArgs {
  return {
    source: Source.GaiaStars,
    focus: STAR_FOCUS_AT_REST,
    boost: null,
    stream: 'leaf',
    capture: false,
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
  it('writes each slot camera uniform into a different physical buffer', () => {
    const device = mockDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    renderer.upload(Source.GaiaStars, CATALOG, 0);
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
    renderer.upload(Source.GaiaStars, CATALOG, 0);
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

  // Aggregates draw linear for `star-upsample` to knee; a capture face has no upsample.
  it('picks the kneed pipeline for leaves and capture aggregates, linear for real-view aggregates', () => {
    const renderer = createStarCatalogRenderer(mockDevice(), 'rgba16float');
    renderer.upload(Source.GaiaStars, CATALOG, 0);
    const setPipeline = vi.fn();
    const pass = {
      setPipeline,
      setBindGroup: vi.fn(),
      drawIndirect: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    renderer.drawCut(pass, args(0));
    renderer.drawCut(pass, { ...args(0), stream: 'aggregate' });
    renderer.drawCut(pass, { ...args(0), stream: 'aggregate', capture: true });

    const labels = setPipeline.mock.calls.map(([p]) => (p as { label: string }).label);
    expect(labels).toEqual([
      'star-catalog-kneed-pipeline',
      'star-catalog-linear-pipeline',
      'star-catalog-kneed-pipeline',
    ]);
  });
});

describe('starCatalogRenderer boost tail', () => {
  // The scratch is reused across draws, so a null boost must clear what a boosted draw left.
  it('star uniforms with a null boost are the identity block', () => {
    const device = mockDevice();
    const renderer = createStarCatalogRenderer(device, 'rgba16float');
    renderer.upload(Source.GaiaStars, CATALOG, 0);
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      drawIndirect: vi.fn(),
    } as unknown as GPURenderPassEncoder;
    const writeBuffer = device.queue.writeBuffer as unknown as ReturnType<typeof vi.fn>;
    const boostLanes = () => {
      const image = writeBuffer.mock.calls.at(-1)![2] as Float32Array;
      expect(image.byteLength).toBe(STAR_UNIFORM_BYTES);
      return Array.from(image.subarray(BOOST_FLOAT_INDEX, BOOST_FLOAT_INDEX + 8));
    };

    renderer.drawCut(pass, {
      ...args(0),
      boost: {
        shipMpc: [0, 0, 0],
        dir: [0, 0, 1],
        beta: 0.6,
        gamma: 1.25,
        contraction: true,
        doppler: true,
        headlight: 2,
      },
    });
    expect(boostLanes()).toEqual([0, 0, 1, Math.fround(0.6), 1.25, 1, 1, 2]);
    renderer.drawCut(pass, args(0));
    expect(boostLanes()).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
