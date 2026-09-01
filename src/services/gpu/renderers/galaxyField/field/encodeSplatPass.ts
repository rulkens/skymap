/**
 * encodeSplatPass — one additive Gaussian-mixture splat (one instanced quad
 * per component, `fieldSplat/`'s field variant or `hiiSplat/`'s HII variants)
 * into its own reduced-resolution target — the smooth field, `hii:extras`,
 * and every `HII_TIERS` tier share this encoding, differing only in label,
 * timing slot, target, pipeline, bind group and instance range. `firstInstance`
 * lets a tier draw its own span of the SHARED `model.hiiComps.buffer` with no
 * shader change — `@builtin(instance_index)` includes the offset.
 */
import { beginClearPass } from '../../../lib/beginClearPass';

export function encodeSplatPass({
  enc,
  label,
  timestampWrites,
  targetView,
  pipeline,
  bindGroup,
  instanceCount,
  firstInstance = 0,
}: {
  readonly enc: GPUCommandEncoder;
  readonly label: string;
  readonly timestampWrites?: GPURenderPassTimestampWrites;
  readonly targetView: GPUTextureView;
  /** A `layout: 'auto'` bind group only satisfies the pipeline it was derived from, so the caller must pass its OWN pipeline/bindGroup pair — field, `hii:young`, `hii:shells`/`hii:dig` and `hii:extras` each draw through a different one. */
  readonly pipeline: GPURenderPipeline;
  /** Reassigned whenever its storage buffer regrows, so it must be read fresh at the call site. */
  readonly bindGroup: GPUBindGroup;
  readonly instanceCount: number;
  /** `@builtin(instance_index)` includes this offset (WebGPU's own contract), so a sub-range draw needs no shader change. */
  readonly firstInstance?: number;
}): void {
  const pass = beginClearPass(enc, label, targetView, timestampWrites);
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6, instanceCount, 0, firstInstance);
  pass.end();
}
