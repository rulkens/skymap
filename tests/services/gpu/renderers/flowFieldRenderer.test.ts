import { describe, it, expect, vi } from 'vitest';
import { createFlowFieldRenderer } from '../../../../src/services/gpu/renderers/flowFieldRenderer';
import type { FlowField } from '../../../../src/@types/data/FlowField';
import type { FlowSettings } from '../../../../src/@types/settings/FlowSettings';

/**
 * Minimal GPUDevice mock for renderer-construction tests.
 *
 * Vitest runs in Node without a real WebGPU surface; every device call the flow
 * renderer makes during construction + setField must return a plausibly-shaped
 * stand-in. The objects are never inspected by the renderer — we only assert
 * that construction wires the 3 compute pipelines + render pipeline + BGLs
 * without throwing, and that `isAnimating` reflects the field/enabled gate.
 * Adds `createComputePipeline` (the engine's first compute renderer) on top of
 * the scalarVolumeRenderer mock.
 */
function mockDevice(): GPUDevice {
  const makeTexture = () => ({ createView: vi.fn(() => ({})), destroy: vi.fn() });
  return {
    createTexture: vi.fn(() => makeTexture()),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createSampler: vi.fn(() => ({})),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createComputePipeline: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({
      getBindGroupLayout: vi.fn(() => ({})),
    })),
    createBindGroup: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn(), writeTexture: vi.fn() },
  } as unknown as GPUDevice;
}

/** A mock loaded velocity field — structurally a FlowField, GPU handles stubbed. */
function mockField(): FlowField {
  return {
    textureView: {},
    sampler: {},
    meta: {
      n: 4,
      origin: [-100, -100, -100],
      voxelSizeMpc: 50,
      frameKind: 'equatorial-cartesian',
      deltaMin: 0,
      deltaMax: 1,
      speedKmsMax: 1,
      speedKmsP99: 1,
      deltaP99: 1,
    },
    dispose: vi.fn(),
  } as unknown as FlowField;
}

/** A full FlowSettings with the spike's hand-dialled advect defaults + overrides. */
function flowStub(over: Partial<FlowSettings> = {}): FlowSettings {
  return {
    enabled: true,
    mode: 'advect',
    intensity: 0.7,
    count: 40000,
    trail: 0.003,
    flowSpeed: 0.06,
    densityBias: 1,
    wander: 0.15,
    ...over,
  };
}

describe('createFlowFieldRenderer', () => {
  it('construct does not throw under the mock device', () => {
    // Smoke: the 3 compute pipelines + render pipeline + both explicit BGLs all
    // build against the mock without a real GPU surface.
    expect(() =>
      createFlowFieldRenderer({ device: mockDevice(), hdrFormat: 'rgba16float' }),
    ).not.toThrow();
  });

  it('isAnimating is false before a field is set', () => {
    const renderer = createFlowFieldRenderer({ device: mockDevice(), hdrFormat: 'rgba16float' });
    expect(renderer.isAnimating(flowStub({ enabled: true }))).toBe(false);
  });

  it('isAnimating reflects enabled && loaded', () => {
    const renderer = createFlowFieldRenderer({ device: mockDevice(), hdrFormat: 'rgba16float' });
    renderer.setField(mockField());
    expect(renderer.isAnimating(flowStub({ enabled: true }))).toBe(true);
    expect(renderer.isAnimating(flowStub({ enabled: false }))).toBe(false);
  });

  it('setField builds a model matrix placing the cube origin in world space', () => {
    // The model-matrix math itself is covered by buildCubeModelMatrix.test.ts;
    // here we only assert setField wires the field without throwing and flips
    // the animating gate true (proving the matrix + bind group built).
    const renderer = createFlowFieldRenderer({ device: mockDevice(), hdrFormat: 'rgba16float' });
    expect(() => renderer.setField(mockField())).not.toThrow();
    expect(renderer.isAnimating(flowStub({ enabled: true }))).toBe(true);
  });
});
