import { describe, it, expect, vi } from 'vitest';
import { createFilamentRenderer } from '../../../../../src/services/gpu/renderers/filaments/filamentRenderer';
import type { FilamentCloud } from '../../../../../src/@types/data/filament/FilamentCloud';
import type { FadeUniformsBgl } from '../../../../../src/@types/rendering/FadeUniformsBgl';

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
