/**
 * encodeDustPresentPass — the JWST dust view: a fullscreen triangle over
 * `dustMapTex`'s column into its own cleared target, which the scene pass then
 * composites additively. NO `timestampWrites`, deliberately — the 'field' slot
 * belongs to the emission splat this pass shares a frame with, and one
 * timestamp pair cannot bracket two passes (see TIMING_SLOTS).
 */
import { beginClearPass } from '../passes/beginClearPass';

export function encodeDustPresentPass({
  enc,
  targetView,
  pipeline,
  bindGroup,
}: {
  readonly enc: GPUCommandEncoder;
  readonly targetView: GPUTextureView;
  readonly pipeline: GPURenderPipeline;
  /** Reassigned whenever the dust map is recreated, so it must be read fresh at the call site. */
  readonly bindGroup: GPUBindGroup;
}): void {
  const pass = beginClearPass(enc, 'galaxy:dustPresentPass', targetView);
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);
  pass.end();
}
