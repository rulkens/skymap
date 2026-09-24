import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDebugLineRenderer } from '../../../../../src/services/gpu/renderers/devTools/debugLineRenderer';

// The renderer borrows markerLines' shaders, so its vertex state must feed
// every `VsIn` location they declare — a missing one is a device-only
// pipeline-validation error that no headless run surfaces otherwise.
function vsInLocations(): number[] {
  const io = readFileSync(
    join(process.cwd(), 'src/services/gpu/shaders/markerLines/io.wesl'),
    'utf-8',
  );
  const body = io.slice(io.indexOf('struct VsIn'), io.indexOf('};', io.indexOf('struct VsIn')));
  return [...body.matchAll(/@location\((\d+)\)/g)].map((m) => Number(m[1])).sort();
}

describe('DebugLineRenderer vertex state', () => {
  it('feeds every VsIn location of the shared markerLines shader', () => {
    const pipelines: GPURenderPipelineDescriptor[] = [];
    const device = {
      createBindGroupLayout: vi.fn(() => ({})),
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      })),
      createPipelineLayout: vi.fn(() => ({})),
      createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
        pipelines.push(desc);
        return {};
      }),
      createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
      createBindGroup: vi.fn(() => ({})),
      queue: { writeBuffer: vi.fn() },
    } as unknown as GPUDevice;
    const ctx = {
      device,
      context: null as unknown as GPUCanvasContext,
      format: 'rgba8unorm' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
      hdrCapable: false,
    };

    createDebugLineRenderer(ctx, ctx.format);

    const fed = Array.from(pipelines[0]!.vertex.buffers!)
      .flatMap((b) => Array.from(b!.attributes))
      .map((a) => a.shaderLocation)
      .sort();
    expect(fed).toEqual(vsInLocations());
  });
});
