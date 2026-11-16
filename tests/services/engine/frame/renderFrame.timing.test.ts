/**
 * renderFrame — the timing service is consulted per pass.
 *
 * The shared fixture gates every optional pass off through null handles, so the
 * trace covers only point-sprites and the Milky-Way cloud's three rows.
 */

import { describe, it, expect, vi } from 'vitest';
import { createDisabledGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';
import { renderFrame } from '../../../../src/services/engine/frame/renderFrame';
import { makeRenderFrameFixture } from '../../../helpers/frame/makeRenderFrameFixture';
import type { GpuTimingService } from '../../../../src/@types/gpu/timing/GpuTimingService';
import type { TimingSlotName } from '../../../../src/@types/gpu/timing/TimingSlotName';

// `descriptorFor` returns a DISTINCT descriptor per slot, with the stub querySet tagged
// `{ _stub: slot }`, so assertions can tell which slot's descriptor landed on which pass.

function makeFakeTimingService() {
  const beginFrame = vi.fn(() => ({ frameIndex: 0, stagingSlot: 0 as const }));
  const descriptorFor = vi.fn((slot: TimingSlotName) => ({
    querySet: { _stub: slot } as unknown as GPUQuerySet,
    beginningOfPassWriteIndex: 100,
    endOfPassWriteIndex: 101,
  }));
  const endFrame = vi.fn();
  const subscribe = vi.fn(() => () => {});
  const destroy = vi.fn();
  const svc: GpuTimingService = {
    enabled: true,
    beginFrame,
    descriptorFor,
    endFrame,
    subscribe,
    destroy,
  };
  return { svc, beginFrame, descriptorFor, endFrame };
}

type TimedDescriptor = GPURenderPassDescriptor & {
  timestampWrites?: GPURenderPassTimestampWrites;
};

describe('renderFrame — timing service hookup', () => {
  it('calls beginFrame once, descriptorFor per enabled layer + composite, and endFrame with the encoder', () => {
    const { svc, beginFrame, descriptorFor, endFrame } = makeFakeTimingService();
    const { input, beginRenderPass, encoder, compositor } = makeRenderFrameFixture({
      timingService: svc,
    });

    renderFrame(input);

    expect(beginFrame).toHaveBeenCalledTimes(1);

    // 'perLayerTimed' strategy: descriptorFor fires once per enabled layer plus once for the hdr→swap
    // composite. Enabled here: point-sprites and the cloud's three rows (milky-way-aggregate in its
    // reduced-res offscreen, milky-way-upsample and milky-way in HDR), which share one liveness gate;
    // MW_ALIVE_DIST_MPC is the close framing that lights the cloud.
    const slotsCalled = descriptorFor.mock.calls.map((c) => c[0]);
    expect(slotsCalled).toContain('point-sprites');
    expect(slotsCalled).toContain('milky-way-aggregate');
    expect(slotsCalled).toContain('milky-way-upsample');
    expect(slotsCalled).toContain('milky-way');
    expect(slotsCalled).toContain('hdr→swap');
    expect(slotsCalled).not.toContain('ui-overlay');
    expect(slotsCalled).not.toContain('tone-map');
    expect(descriptorFor).toHaveBeenCalledTimes(5);

    // Every opened pass carries its slot's timestampWrites (the first HDR pass carries the clear AND
    // its own descriptor), so all five begins are tagged; the composite's pass is opened by the
    // executor against the swap view.
    expect(beginRenderPass.mock.calls).toHaveLength(5);
    const stubSlots = beginRenderPass.mock.calls.map(([desc]) => {
      const tw = (desc as TimedDescriptor).timestampWrites;
      expect(tw).toBeDefined();
      return (tw!.querySet as unknown as { _stub: TimingSlotName })._stub;
    });
    // The cloud's aggregate row draws into its own offscreen between the COSMO
    // hdr layer and the two hdr NEAR0 rows it feeds; within the hdr NEAR0 step
    // the upsample precedes the dust so the dust extincts the cloud's own
    // starlight.
    expect(stubSlots).toEqual([
      'point-sprites',
      'milky-way-aggregate',
      'milky-way-upsample',
      'milky-way',
      'hdr→swap',
    ]);

    // The timed path's composite takes the same tone gate as the merged one:
    // an SDR swap chain gets no headroom, whatever the settings knobs say.
    expect(compositor.draw.mock.calls[0]![3]).toMatchObject({ hdrKnee: 0, hdrHeadroom: 0 });

    expect(endFrame).toHaveBeenCalledTimes(1);
    expect(endFrame.mock.calls[0]![1]).toBe(encoder);
  });

  it('skips all timing calls when timingService is disabled', () => {
    const { input, beginRenderPass, createCommandEncoder } = makeRenderFrameFixture({
      timingService: createDisabledGpuTimingService(),
    });

    expect(() => renderFrame(input)).not.toThrow();

    expect(createCommandEncoder).toHaveBeenCalled();

    for (const [desc] of beginRenderPass.mock.calls) {
      expect((desc as TimedDescriptor).timestampWrites).toBeUndefined();
    }
  });

  it('bills the density raymarch pass against its own slot when timings are active', () => {
    const { svc, descriptorFor } = makeFakeTimingService();
    const { input, beginRenderPass, renderTargetViews, densityRuntime } = makeRenderFrameFixture({
      timingService: svc,
    });

    Object.assign(densityRuntime.renderer, { hasActiveFields: () => true });
    const reducedView = { __id: 'reduced' } as unknown as GPUTextureView;
    renderTargetViews['cosmic-web-density'] = reducedView;

    renderFrame(input);

    const slots = descriptorFor.mock.calls.map((c) => c[0]);
    expect(slots).toContain('cosmic-web-density');
    // The density render step precedes the hdr step, so the density pass is the FIRST
    // beginRenderPass (index 0).
    const preDesc = beginRenderPass.mock.calls[0]![0] as TimedDescriptor;
    expect(preDesc.timestampWrites).toBeDefined();
    const tag = (preDesc.timestampWrites!.querySet as unknown as { _stub: string })._stub;
    expect(tag).toBe('cosmic-web-density');
  });
});
