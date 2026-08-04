/**
 * encodeSplatPass — one additive Gaussian-mixture splat (`splat.wesl`: one
 * instanced quad per component) into its own cleared reduced-resolution
 * target. The smooth field and the HII tier are the same encoding, differing
 * only in label, timing slot, target, bind group and instance count.
 *
 * `timestampWrites` arrives already resolved — see `beginClearPass` for why
 * the `descriptorFor` call has to stay on the caller's branch.
 */
import { beginClearPass } from '../passes/beginClearPass';

export function encodeSplatPass({
  enc,
  label,
  timestampWrites,
  targetView,
  pipeline,
  bindGroup,
  instanceCount,
}: {
  readonly enc: GPUCommandEncoder;
  readonly label: string;
  readonly timestampWrites?: GPURenderPassTimestampWrites;
  readonly targetView: GPUTextureView;
  /** Both tiers pass the same pipeline, but a `layout: 'auto'` bind group only satisfies the pipeline it was derived from, so the pair has to travel together. */
  readonly pipeline: GPURenderPipeline;
  /** Reassigned whenever its storage buffer regrows, so it must be read fresh at the call site. */
  readonly bindGroup: GPUBindGroup;
  readonly instanceCount: number;
}): void {
  const pass = beginClearPass(enc, label, targetView, timestampWrites);
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6, instanceCount);
  pass.end();
}
