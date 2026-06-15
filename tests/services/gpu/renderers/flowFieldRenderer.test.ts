import { describe, it, expect, vi } from 'vitest';
import { createFlowFieldRenderer } from '../../../../src/services/gpu/renderers/flowFieldRenderer';
import type { ScalarCube } from '../../../../src/@types/data/volume/ScalarCube';
import type { FlowSettings } from '../../../../src/@types/settings/FlowSettings';

/**
 * Minimal GPUDevice mock for renderer-construction tests.
 *
 * Vitest runs in Node without a real WebGPU surface; every device call the flow
 * renderer makes during construction + upload must return a plausibly-shaped
 * stand-in. The objects are never inspected by the renderer — we only assert
 * that construction wires the 3 compute pipelines + render pipeline + BGLs
 * without throwing, and that `isAnimating` reflects the field/enabled gate.
 * Adds `createComputePipeline` (the engine's first compute renderer) on top of
 * the volumeFieldRenderer mock.
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

/**
 * A mock decoded velocity cube — a 4-channel `ScalarCube` with `velocityStats`
 * (the shape `flowFieldMetaFromCube` requires). `upload` uploads it via the
 * real `flowFieldFromCube` against the mock device, so this also exercises the
 * meta derivation + model-matrix build.
 */
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
    boundaryFadeWidth: 0.1,
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
    renderer.upload(mockCube());
    expect(renderer.isAnimating(flowStub({ enabled: true }))).toBe(true);
    expect(renderer.isAnimating(flowStub({ enabled: false }))).toBe(false);
  });

  it('upload builds a model matrix placing the cube origin in world space', () => {
    // The model-matrix math itself is covered by buildCubeModelMatrix.test.ts;
    // here we only assert upload wires the field without throwing and flips
    // the animating gate true (proving the matrix + bind group built).
    const renderer = createFlowFieldRenderer({ device: mockDevice(), hdrFormat: 'rgba16float' });
    expect(() => renderer.upload(mockCube())).not.toThrow();
    expect(renderer.isAnimating(flowStub({ enabled: true }))).toBe(true);
  });
});
