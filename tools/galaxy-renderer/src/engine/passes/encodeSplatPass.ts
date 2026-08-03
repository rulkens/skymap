/**
 * encodeSplatPass — one additive Gaussian-mixture splat (`splat.wesl`: one
 * instanced quad per component) into its own cleared reduced-resolution
 * target. The smooth field and the HII tier are the same encoding, differing
 * only in label, timing slot, target, bind group and instance count.
 *
 * `descriptorFor` is called here rather than by the caller because this
 * function always opens the pass; the gates stay outside. It marks its slot
 * consumed, and a slot consumed on a frame its pass never ran makes the HUD
 * decode stale ticks as live.
 */
import type { GpuTimingService } from '../../../../../src/@types/gpu/timing/GpuTimingService';
import type { TimingSlotName } from '../../../../../src/@types/gpu/timing/TimingSlotName';

import { beginClearPass } from './beginClearPass';

export function encodeSplatPass({
  enc,
  timing,
  label,
  slot,
  targetView,
  pipeline,
  bindGroup,
  instanceCount,
}: {
  readonly enc: GPUCommandEncoder;
  readonly timing: Pick<GpuTimingService, 'descriptorFor'>;
  readonly label: string;
  readonly slot: TimingSlotName;
  readonly targetView: GPUTextureView;
  /** Both tiers pass the same pipeline, but a `layout: 'auto'` bind group only satisfies the pipeline it was derived from, so the pair has to travel together. */
  readonly pipeline: GPURenderPipeline;
  /** Reassigned whenever its storage buffer regrows, so it must be read fresh at the call site. */
  readonly bindGroup: GPUBindGroup;
  readonly instanceCount: number;
}): void {
  const pass = beginClearPass(enc, label, targetView, timing.descriptorFor(slot));
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6, instanceCount);
  pass.end();
}
