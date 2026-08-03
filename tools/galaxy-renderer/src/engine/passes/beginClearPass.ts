/**
 * beginClearPass — one colour attachment, cleared and stored: the descriptor
 * shape most of this engine's passes share. `alpha` is the clear alpha (0 for
 * the offscreens an additive composite reads, 1 for the HDR scene and the
 * post chain's LDR targets).
 *
 * `timestampWrites` arrives ALREADY RESOLVED, here and in every pass module:
 * `gpuTimingService.descriptorFor` marks its slot consumed as a side effect,
 * so that call has to stay on the branch that actually opens the pass — a slot
 * consumed on a frame its pass never ran makes the HUD decode stale ticks as
 * live.
 */
export function beginClearPass(
  enc: GPUCommandEncoder,
  label: string,
  view: GPUTextureView,
  timestampWrites?: GPURenderPassTimestampWrites,
  alpha = 0,
): GPURenderPassEncoder {
  return enc.beginRenderPass({
    label,
    colorAttachments: [
      { view, clearValue: { r: 0, g: 0, b: 0, a: alpha }, loadOp: 'clear', storeOp: 'store' },
    ],
    ...(timestampWrites ? { timestampWrites } : {}),
  });
}
