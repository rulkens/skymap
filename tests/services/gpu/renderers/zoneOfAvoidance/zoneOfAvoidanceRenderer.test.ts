import { describe, it, expect, vi } from 'vitest';
import { createZoneOfAvoidanceRenderer } from '../../../../../src/services/gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer';
import { parseFontMetrics } from '../../../../../src/services/gpu/labelLayout/fontMetrics';
import type { LoadedFontAtlases } from '../../../../../src/@types/rendering/LoadedFontAtlases';

// Minimal mock GPUDevice — Vitest runs in Node without a WebGPU surface.
// Mirrors horizonShellRenderer.test.ts / labelRenderer.test.ts's pattern:
// every create* call returns a plausibly-shaped stand-in; createRenderPipeline
// optionally records the descriptors so pipeline shape can be asserted.
function mockDevice(renderPipelines?: GPURenderPipelineDescriptor[]): GPUDevice {
  return {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelines?.push(desc);
      return {};
    }),
    createTexture: vi.fn(() => ({ createView: vi.fn(() => ({})), destroy: vi.fn() })),
    createSampler: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn(), copyExternalImageToTexture: vi.fn() },
  } as unknown as GPUDevice;
}

// Single uppercase-A glyph — enough for the label pipeline's construction-time
// `layoutLabel` call to run without throwing; unmatched characters in the real
// label text are silently dropped (see labelRenderer.test.ts).
const FIXTURE_METRICS = parseFontMetrics({
  pages: ['x.png'],
  common: { lineHeight: 50, base: 38, scaleW: 512, scaleH: 512 },
  info: { face: 'X', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 4 },
  chars: [
    {
      id: 65,
      x: 0,
      y: 0,
      width: 30,
      height: 40,
      xoffset: 0,
      yoffset: 0,
      xadvance: 25,
      page: 0,
      chnl: 15,
    },
  ],
});

const FIXTURE_ATLASES: LoadedFontAtlases = {
  metricsByFont: { cormorant: FIXTURE_METRICS },
  bitmaps: [],
};

describe('createZoneOfAvoidanceRenderer', () => {
  it('constructs under a null device', () => {
    expect(() =>
      createZoneOfAvoidanceRenderer(mockDevice(), 'rgba16float', FIXTURE_ATLASES),
    ).not.toThrow();
  });

  it('builds a pick pipeline targeting r32uint with no blend and a depth test', () => {
    // Regression guard: a blend key on an integer target is a validation
    // error, and a missing depthStencil breaks occlusion against other
    // COSMO pick draws.
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createZoneOfAvoidanceRenderer(mockDevice(renderPipelines), 'rgba16float', FIXTURE_ATLASES);
    const pick = renderPipelines.find((p) => p.label === 'zoneOfAvoidance-pick-pipeline');
    expect(pick).toBeDefined();
    const target = Array.from(pick!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('r32uint');
    expect(target!.blend).toBeUndefined();
    expect(pick!.depthStencil).toBeDefined();
  });
});
