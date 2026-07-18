import { describe, it, expect, vi } from 'vitest';
import { createDiskRadiusRing } from '../../../../../src/services/gpu/renderers/devTools/diskRadiusRing';

/**
 * The ring's two uniform buffers are structurally identical from the mock's
 * point of view (both are plain UNIFORM|COPY_DST allocations), so the stub
 * device hands back a labelled marker object per `createBuffer` call and the
 * writeBuffer recorder keys on that label.  Keying on call ORDER instead would
 * quietly pass if the two `writeBuffer` calls were ever swapped — exactly the
 * kind of mix-up this test exists to catch.
 */
type Write = { label: string; data: Float32Array };

function newStubDevice(writes: Write[]) {
  return {
    createBindGroupLayout: vi.fn(() => ({})),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createBuffer: vi.fn((desc: GPUBufferDescriptor) => ({ label: desc.label, destroy: vi.fn() })),
    createBindGroup: vi.fn(() => ({})),
    queue: {
      writeBuffer: vi.fn((buffer: { label: string }, _offset: number, data: Float32Array) => {
        // Copy: the renderer reuses no scratch here, but a copy keeps the
        // assertion honest if it ever starts to.
        writes.push({ label: buffer.label, data: Float32Array.from(data) });
      }),
    },
  } as unknown as GPUDevice;
}

const writeFor = (writes: Write[], label: string): Float32Array =>
  writes.find((w) => w.label === label)!.data;

describe('diskRadiusRing', () => {
  it('packs the ring uniform in the layout the WESL struct reads', () => {
    const writes: Write[] = [];
    const device = newStubDevice(writes);
    const ring = createDiskRadiusRing(device, 'bgra8unorm');

    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    const viewProj = new Float32Array(16).map((_, i) => i + 1);
    ring.draw(pass, viewProj, {
      center: [10, 20, 30],
      radiusWorld: 0.5,
      // paDeg and axisRatio are adjacent floats of the same type — swapping
      // them typechecks and silently squashes the ring by an angle and tilts
      // it by a ratio.  Distinct, non-interchangeable values pin the order.
      paDeg: 45,
      axisRatioForTilt: 0.25,
    });

    // DiskRadiusRingUniforms: center(3) + radiusWorld + paDeg + axisRatio + 2 pads.
    const ringUni = writeFor(writes, 'disk-radius-ring-ring');
    expect(Array.from(ringUni)).toEqual([10, 20, 30, 0.5, 45, 0.25, 0, 0]);

    // CameraUniforms prefix: viewProj at floats [0..15]; the ring does no
    // pixel-space math, so viewportPx ([16..17]) and the pads stay zero.
    const camUni = writeFor(writes, 'disk-radius-ring-camera');
    expect(Array.from(camUni.subarray(0, 16))).toEqual(Array.from(viewProj));
    expect(Array.from(camUni.subarray(16))).toEqual([0, 0, 0, 0]);
  });
});
