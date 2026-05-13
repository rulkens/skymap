/**
 * gpuTimingService — unit coverage with a stub GPUDevice.
 *
 * Four scenarios:
 *   1. No-op mode when `device.features.has('timestamp-query')` is false:
 *      `available` is false, `descriptorFor` returns undefined, no GPU
 *      resources allocated, subscribers never fire.
 *   2. Active mode descriptor shape: `descriptorFor('point-sprites')`
 *      returns `{querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1}`.
 *   3. `endFrame` records `resolveQuerySet` + `copyBufferToBuffer` on
 *      the supplied encoder.
 *   4. Subscribers fire once a staging buffer's mapAsync resolves, with
 *      a `GpuTimingFrame` carrying the decoded perPassMs map.
 */

import { describe, it, expect, vi } from 'vitest';
import { createGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';

type FakeQuerySet = { destroy: () => void };
type FakeBuffer = {
  mapAsync: (mode: number) => Promise<undefined>;
  getMappedRange: () => ArrayBuffer;
  unmap: () => void;
  destroy: () => void;
};

function makeDevice(opts: { supportsTimestamp: boolean; period?: number }): GPUDevice {
  const features = new Set<string>();
  if (opts.supportsTimestamp) features.add('timestamp-query');
  const querySet: FakeQuerySet = { destroy: vi.fn() };
  const stagingBuffers: FakeBuffer[] = [];
  let nextBufferIdx = 0;
  const queue = {
    submit: vi.fn(),
    writeBuffer: vi.fn(),
    onSubmittedWorkDone: vi.fn(async () => undefined),
    get timestampPeriod() {
      return opts.period ?? 1;
    },
  };
  return {
    features,
    queue,
    createQuerySet: vi.fn(() => querySet as unknown as GPUQuerySet),
    createBuffer: vi.fn(() => {
      const backing = new ArrayBuffer(32 * 8);
      const buf: FakeBuffer = {
        mapAsync: vi.fn(async () => undefined),
        getMappedRange: vi.fn(() => backing),
        unmap: vi.fn(),
        destroy: vi.fn(),
      };
      stagingBuffers.push(buf);
      nextBufferIdx++;
      return buf as unknown as GPUBuffer;
    }),
  } as unknown as GPUDevice;
}

describe('gpuTimingService — no-op mode (feature missing)', () => {
  it('marks itself unavailable and short-circuits every method', () => {
    const device = makeDevice({ supportsTimestamp: false });
    const svc = createGpuTimingService(device);

    expect(svc.available).toBe(false);
    expect(svc.descriptorFor('point-sprites')).toBeUndefined();
    const ctx = svc.beginFrame();
    expect(ctx.frameIndex).toBe(0);
    const fakeEncoder = { resolveQuerySet: vi.fn(), copyBufferToBuffer: vi.fn() };
    svc.endFrame(ctx, fakeEncoder as unknown as GPUCommandEncoder);
    expect(fakeEncoder.resolveQuerySet).not.toHaveBeenCalled();
    expect(fakeEncoder.copyBufferToBuffer).not.toHaveBeenCalled();

    const listener = vi.fn();
    svc.subscribe(listener);
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not allocate GPU resources', () => {
    const device = makeDevice({ supportsTimestamp: false });
    createGpuTimingService(device);

    expect(device.createQuerySet as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(device.createBuffer as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});

describe('gpuTimingService — active mode', () => {
  it('exposes `available: true` when feature is present', () => {
    const device = makeDevice({ supportsTimestamp: true });
    const svc = createGpuTimingService(device);
    expect(svc.available).toBe(true);
  });

  it('allocates a query set + resolve buffer + two staging buffers', () => {
    const device = makeDevice({ supportsTimestamp: true });
    createGpuTimingService(device);

    expect(device.createQuerySet).toHaveBeenCalledTimes(1);
    expect(device.createBuffer).toHaveBeenCalledTimes(3);
  });

  it('returns a descriptor with the correct slot indices', () => {
    const device = makeDevice({ supportsTimestamp: true });
    const svc = createGpuTimingService(device);

    const desc = svc.descriptorFor('procedural-disks');
    expect(desc).toBeDefined();
    expect(desc!.beginningOfPassWriteIndex).toBe(2);
    expect(desc!.endOfPassWriteIndex).toBe(3);
    expect(desc!.querySet).toBeDefined();
  });

  it('endFrame records resolveQuerySet + copyBufferToBuffer', () => {
    const device = makeDevice({ supportsTimestamp: true });
    const svc = createGpuTimingService(device);
    const encoder = {
      resolveQuerySet: vi.fn(),
      copyBufferToBuffer: vi.fn(),
    };

    const ctx = svc.beginFrame();
    svc.endFrame(ctx, encoder as unknown as GPUCommandEncoder);

    expect(encoder.resolveQuerySet).toHaveBeenCalledTimes(1);
    expect(encoder.copyBufferToBuffer).toHaveBeenCalledTimes(1);
  });

  it('rotates the staging-slot cursor each frame', () => {
    const device = makeDevice({ supportsTimestamp: true });
    const svc = createGpuTimingService(device);

    expect(svc.beginFrame().stagingSlot).toBe(0);
    expect(svc.beginFrame().stagingSlot).toBe(1);
    expect(svc.beginFrame().stagingSlot).toBe(0);
    expect(svc.beginFrame().stagingSlot).toBe(1);
  });

  it('fires subscribers after a frame is encoded + its map resolves', async () => {
    const device = makeDevice({ supportsTimestamp: true, period: 1 });
    const svc = createGpuTimingService(device);
    const listener = vi.fn();
    svc.subscribe(listener);

    const encoder = {
      resolveQuerySet: vi.fn(),
      copyBufferToBuffer: vi.fn(
        (
          src: GPUBuffer,
          srcOff: number,
          dst: GPUBuffer & { getMappedRange: () => ArrayBuffer },
          dstOff: number,
          size: number,
        ) => {
          const backing = dst.getMappedRange();
          const u64 = new BigUint64Array(backing);
          u64[0] = 0n;
          u64[1] = 1_500_000n;
        },
      ),
    };

    const ctx = svc.beginFrame();
    svc.endFrame(ctx, encoder as unknown as GPUCommandEncoder);

    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(listener).toHaveBeenCalledTimes(1);
    const frame = listener.mock.calls[0]![0];
    expect(frame.frameIndex).toBe(0);
    expect(frame.perPassMs.get('point-sprites')).toBeCloseTo(1.5, 6);
  });
});
