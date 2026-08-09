/**
 * encodeSplatPass — one additive Gaussian-mixture splat (`splat.wesl`: one
 * instanced quad per component) into its own reduced-resolution target. The
 * smooth field and the HII tier are the same encoding, differing only in
 * label, timing slot, target, bind group and instance count.
 *
 * `firstInstance`/`loadOp` exist for the HII timing split
 * (`createGalaxyEngine.ts`'s `drawFrame`): several sub-passes drawing
 * disjoint `firstInstance..firstInstance+instanceCount` ranges into the SAME
 * `hiiTex`, the first clearing it and the rest loading. Both default to
 * today's single-pass behaviour, so every other caller is unaffected.
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
  firstInstance = 0,
  loadOp = 'clear',
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
  /** `@builtin(instance_index)` includes this offset (WebGPU's own contract), so a sub-range draw needs no shader change. */
  readonly firstInstance?: number;
  readonly loadOp?: GPULoadOp;
}): void {
  const pass = beginClearPass(enc, label, targetView, timestampWrites, 0, loadOp);
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6, instanceCount, 0, firstInstance);
  pass.end();
}
