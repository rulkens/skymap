import { describe, it, expect, vi } from 'vitest';
import { createFlowFieldRenderer } from '../../../../src/layers/flow/render/flowFieldRenderer';
import type { ScalarCube } from '../../../../src/@types/data/volume/ScalarCube';
import type { FlowSettings } from '../../../../src/@types/settings/FlowSettings';
import { HEAD_SPEED_SCALE } from '../../../../src/data/flow/flowFieldConstants';

/**
 * Minimal GPUDevice mock for renderer-construction tests.
 *
 * Vitest runs in Node without a real WebGPU surface; every device call the flow
 * renderer makes during construction + upload must return a plausibly-shaped
 * stand-in. The objects are never inspected by the renderer — we only assert
 * that construction wires the 3 compute pipelines + render pipeline + BGLs
 * without throwing, and that `fieldLoaded` reflects the field-committed gate.
 * Adds `createComputePipeline` (the engine's first compute renderer) on top of
 * the volumeFieldRenderer mock.
 */
function mockDevice(renderPipelines?: GPURenderPipelineDescriptor[]): GPUDevice {
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
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelines?.push(desc);
      return { getBindGroupLayout: vi.fn(() => ({})) };
    }),
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

describe('createFlowFieldRenderer', () => {
  it('allocates no particle buffers until the first upload (flow is default-off)', () => {
    const device = mockDevice();
    createFlowFieldRenderer({ device, targetFormat: 'rgba16float' });
    // Only the two tiny uniform buffers (compPrm, camBuf) exist at construction
    // — the ~27 MB part/trail/acc set is a session cost only a session that
    // enables flow (and so uploads a cube) should pay.
    expect(device.createBuffer).toHaveBeenCalledTimes(2);
  });

  it('fieldLoaded is false before upload, true after', () => {
    // The flow fade row's guard reads this — it reports whether a cube is
    // committed, independent of the slot lifecycle.
    const renderer = createFlowFieldRenderer({ device: mockDevice(), targetFormat: 'rgba16float' });
    expect(renderer.fieldLoaded()).toBe(false);
    renderer.upload(mockCube());
    expect(renderer.fieldLoaded()).toBe(true);
  });

  it('encodeCompute packs dt and headStep from real elapsed time, not a fixed per-frame step', () => {
    // Pins the whole point of this change: dt/headStep must track wall-clock
    // gaps between calls, not a hardcoded per-frame constant. Would fail if
    // someone reinstated `DT = 0.016`.
    const device = mockDevice();
    const renderer = createFlowFieldRenderer({ device, targetFormat: 'rgba16float' });
    renderer.upload(mockCube());

    const mockPass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      dispatchWorkgroups: vi.fn(),
      end: vi.fn(),
    };
    const encoder = {
      beginComputePass: vi.fn(() => mockPass),
    } as unknown as GPUCommandEncoder;

    const flow: FlowSettings = {
      enabled: true,
      mode: 'advect',
      intensity: 0.7,
      count: 1000,
      trail: 0.003,
      flowSpeed: 0.06,
      densityBias: 1,
      wander: 0.15,
      boundaryFadeWidth: 0.1,
    };

    // First call has no prior timestamp, so dt is 0 regardless of nowMs.
    renderer.encodeCompute(encoder, flow, 1000);
    // Second call, 20 ms later (within MAX_FRAME_DELTA_SEC) — the renderer's
    // own scratch buffer is reused each write, so the typed array must be
    // COPIED out of writeBuffer's argument here, or every capture below
    // aliases the same (final) values.
    renderer.encodeCompute(encoder, flow, 1020);

    const writeBuffer = device.queue.writeBuffer as unknown as ReturnType<typeof vi.fn>;
    expect(writeBuffer).toHaveBeenCalledTimes(2);
    const secondArg = writeBuffer.mock.calls[1]![2] as Float32Array;
    const f32 = new Float32Array(secondArg.buffer.slice(0));

    const expectedDtSec = 0.02;
    expect(f32[0]).toBeCloseTo(expectedDtSec, 6);
    expect(f32[2]).toBeCloseTo(flow.flowSpeed * HEAD_SPEED_SCALE * expectedDtSec, 6);
  });

  it('reconcile arms a reseed when mode or count changes and not otherwise', () => {
    // Observable through encodeCompute's own contract (module header): a seed
    // pass only opens a SECOND beginComputePass call ahead of the integrate
    // pass, so beginComputePass's call count is the renderer's own signal of
    // whether a reseed was pending — no spy on the private `reseed` latch.
    const device = mockDevice();
    const renderer = createFlowFieldRenderer({ device, targetFormat: 'rgba16float' });
    renderer.upload(mockCube());

    const mockPass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      dispatchWorkgroups: vi.fn(),
      end: vi.fn(),
    };
    const beginComputePass = vi.fn(() => mockPass);
    const encoder = { beginComputePass } as unknown as GPUCommandEncoder;
    const flow: FlowSettings = {
      enabled: true,
      mode: 'advect',
      intensity: 0.7,
      count: 1000,
      trail: 0.003,
      flowSpeed: 0.06,
      densityBias: 1,
      wander: 0.15,
      boundaryFadeWidth: 0.1,
    };

    // `upload` already armed the first seed; consume it before this test's
    // own reconcile calls so only THEIR effect is under test.
    renderer.encodeCompute(encoder, flow, 1000);
    beginComputePass.mockClear();

    // First call only records — no baseline to differ from yet.
    renderer.reconcile({ mode: 'advect', count: 1000 });
    renderer.encodeCompute(encoder, flow, 1010);
    expect(beginComputePass).toHaveBeenCalledTimes(1); // integrate only

    beginComputePass.mockClear();

    // Same seed again — arms nothing.
    renderer.reconcile({ mode: 'advect', count: 1000 });
    renderer.encodeCompute(encoder, flow, 1020);
    expect(beginComputePass).toHaveBeenCalledTimes(1);

    beginComputePass.mockClear();

    // count differs from the last value handed in — arms once.
    renderer.reconcile({ mode: 'advect', count: 2000 });
    renderer.encodeCompute(encoder, flow, 1030);
    expect(beginComputePass).toHaveBeenCalledTimes(2); // seed + integrate
  });
});
