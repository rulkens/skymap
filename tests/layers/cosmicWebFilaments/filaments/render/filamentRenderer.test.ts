/**
 * filamentRenderer — the antique look's lines row reads alpha past 0.9 as an orbit
 * trail and erodes it to a core, so the print draw must never sum overlaps there:
 * summed, every dense spine vanished from the plate. Over-compositing saturates below 1.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';
import { createFilamentRenderer } from '../../../../../src/layers/cosmicWebFilaments/filaments/render/filamentRenderer';
import type { FadeUniformsBgl } from '../../../../../src/@types/rendering/FadeUniformsBgl';
import type { FilamentCloud } from '../../../../../src/@types/data/filament/FilamentCloud';

function mockDevice(pipelines: GPURenderPipelineDescriptor[]): GPUDevice {
  return {
    createShaderModule: vi.fn(() => ({ getCompilationInfo: async () => ({ messages: [] }) })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((d: GPURenderPipelineDescriptor) => {
      pipelines.push(d);
      return { label: d.label };
    }),
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
}

const CLOUD: FilamentCloud = {
  stripCount: 1,
  vertexCount: 2,
  stripOffsets: new Uint32Array([0, 2]),
  vertices: new Float32Array([0, 0, 0, 0.5, 1, 0, 0, 1]),
};

function drawnPipeline(print: boolean): GPURenderPipelineDescriptor | undefined {
  const pipelines: GPURenderPipelineDescriptor[] = [];
  const renderer = createFilamentRenderer(
    mockDevice(pipelines),
    'rgba16float',
    {} as FadeUniformsBgl,
  );
  renderer.upload(CLOUD);
  const setPipeline = vi.fn();
  const pass = {
    setPipeline,
    setBindGroup: vi.fn(),
    setIndexBuffer: vi.fn(),
    setVertexBuffer: vi.fn(),
    drawIndexed: vi.fn(),
  } as unknown as GPURenderPassEncoder;
  renderer.draw(
    pass,
    new Float32Array(16) as unknown as Mat4,
    [800, 600],
    600,
    1.5,
    1,
    1,
    [0, 0, 0],
    [1, 1, 1],
    print,
  );
  const label = (setPipeline.mock.calls[0]?.[0] as { label: string } | undefined)?.label;
  return pipelines.find((d) => d.label === label);
}

describe('filamentRenderer blend', () => {
  it('the print draw composites overlapping strokes over, never summing them', () => {
    const alpha = drawnPipeline(true)?.fragment?.targets?.[0]?.blend?.alpha;
    expect(alpha).toMatchObject({
      srcFactor: 'one',
      dstFactor: 'one-minus-src-alpha',
      operation: 'add',
    });
  });

  it('the plain draw still sums its glow', () => {
    const blend = drawnPipeline(false)?.fragment?.targets?.[0]?.blend;
    expect(blend?.alpha?.operation).toBe('add');
    expect(blend?.color?.operation).toBe('add');
  });
});
