import { describe, it, expect, vi } from 'vitest';
import {
  buildSegmentInstances,
  createFilamentRenderer,
} from '../../../../src/services/gpu/renderers/filamentRenderer';
import type { FilamentCloud } from '../../../../src/@types/data/filament/FilamentCloud';
import type { FadeUniformsBgl } from '../../../../src/@types/rendering/FadeUniformsBgl';

/**
 * Minimal GPUDevice mock for renderer-construction tests — the same shape the
 * flowFieldRenderer tests use. The objects are never inspected by the renderer;
 * we only assert construction + upload don't throw and that `hasCloud` reflects
 * the cloud-committed gate the filaments fade row guards on.
 */
function mockDevice(renderPipelines?: GPURenderPipelineDescriptor[]): GPUDevice {
  return {
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelines?.push(desc);
      return { getBindGroupLayout: vi.fn(() => ({})) };
    }),
    createBindGroup: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
}

const mockFadeBgl = {} as unknown as FadeUniformsBgl;

// One strip, two vertices → a single drawable segment.
function oneSegmentCloud(): FilamentCloud {
  return {
    stripCount: 1,
    vertexCount: 2,
    stripOffsets: new Uint32Array([0, 2]),
    vertices: new Float32Array([10, 20, 30, 0.9, 11, 21, 31, 0.8]),
  };
}

describe('createFilamentRenderer.hasCloud', () => {
  it('is false before upload, true after, false again after clear', () => {
    const renderer = createFilamentRenderer(mockDevice(), 'rgba16float', mockFadeBgl);
    expect(renderer.hasCloud()).toBe(false);
    renderer.upload(oneSegmentCloud());
    expect(renderer.hasCloud()).toBe(true);
    renderer.clear();
    expect(renderer.hasCloud()).toBe(false);
  });

  it('bakes the given targetFormat into the pipeline colour target', () => {
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createFilamentRenderer(mockDevice(renderPipelines), 'rgba16float', mockFadeBgl);
    expect(renderPipelines).toHaveLength(1);
    const target = Array.from(renderPipelines[0]!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
  });

  it('stays false when the uploaded cloud has zero segments', () => {
    // An empty skeleton uploads to a null instance buffer — nothing drawable,
    // so the fade guard must keep suppressing.
    const renderer = createFilamentRenderer(mockDevice(), 'rgba16float', mockFadeBgl);
    renderer.upload({
      stripCount: 0,
      vertexCount: 0,
      stripOffsets: new Uint32Array([0]),
      vertices: new Float32Array(0),
    });
    expect(renderer.hasCloud()).toBe(false);
  });
});

describe('buildSegmentInstances', () => {
  it('emits one instance per consecutive vertex pair within each strip', () => {
    // Two strips: A (3 verts → 2 segments), B (2 verts → 1 segment) = 3 segments
    const cloud: FilamentCloud = {
      stripCount: 2,
      vertexCount: 5,
      stripOffsets: new Uint32Array([0, 3, 5]),
      vertices: new Float32Array([
        10, 20, 30, 0.9, 11, 21, 31, 0.8, 12, 22, 32, 0.7, 40, 50, 60, 0.6, 41, 51, 61, 0.5,
      ]),
    };
    const result = buildSegmentInstances(cloud);
    expect(result.segmentCount).toBe(3);
    expect(result.data.length).toBe(3 * 8); // 8 floats per segment

    // First segment of strip A: (v0, v1).
    // Note: expected is wrapped in Float32Array so the f32-precision
    // round-trip on 0.9/0.8/0.7/0.6 matches what `result.data` (also
    // a Float32Array) holds.  Comparing raw JS-double literals via
    // toEqual would mismatch by ~1e-8 because 0.9 isn't representable
    // in 32-bit float.
    expect(Array.from(result.data.slice(0, 8))).toEqual(
      Array.from(new Float32Array([10, 20, 30, 0.9, 11, 21, 31, 0.8])),
    );
    // Second segment of strip A: (v1, v2)
    expect(Array.from(result.data.slice(8, 16))).toEqual(
      Array.from(new Float32Array([11, 21, 31, 0.8, 12, 22, 32, 0.7])),
    );
    // First (only) segment of strip B: (v3, v4)
    expect(Array.from(result.data.slice(16, 24))).toEqual(
      Array.from(new Float32Array([40, 50, 60, 0.6, 41, 51, 61, 0.5])),
    );
  });

  it('handles zero strips', () => {
    const cloud: FilamentCloud = {
      stripCount: 0,
      vertexCount: 0,
      stripOffsets: new Uint32Array([0]),
      vertices: new Float32Array(0),
    };
    const result = buildSegmentInstances(cloud);
    expect(result.segmentCount).toBe(0);
    expect(result.data.length).toBe(0);
  });
});
