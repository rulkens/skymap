/**
 * encodeSplatPass — one additive Gaussian-mixture splat (one instanced quad
 * per component — `fieldSplat/`'s field variant or `hiiSplat/`'s HII
 * variants, the per-splat-type split of the former shared `splat.wesl`) into its own
 * reduced-resolution target. The smooth field, `hiiTex`'s `hii:extras` draw
 * and every `HII_TIERS` tier are the same encoding, differing in label,
 * timing slot, target, PIPELINE (field/young/erosion/extras each draw
 * through their own — see `createGalaxyEngine.ts`'s pipeline comment), bind
 * group and instance range.
 *
 * `firstInstance` is what lets a tier draw its own contiguous span of the
 * SHARED `model.hiiComps.buffer` (`hiiSegments`' `first`/`count`) without a
 * shader change — `@builtin(instance_index)` includes the offset (WebGPU's
 * own contract). Every caller now opens its own freshly cleared target (each
 * `HII_TIERS` row has its own texture — see `allocateTier`'s own doc), so
 * there is no `loadOp` parameter here any more: nothing shares an attachment
 * across two calls in one frame.
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
