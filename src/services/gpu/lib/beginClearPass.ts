/**
 * beginClearPass — one colour attachment, cleared and stored: the descriptor
 * shape most render passes share. `timestampWrites` arrives ALREADY
 * RESOLVED: `gpuTimingService.descriptorFor` marks its slot consumed as a
 * side effect, so that call must stay on the branch that actually opens the
 * pass — a slot consumed on a frame its pass never ran makes the HUD decode
 * stale ticks.
 */
export function beginClearPass(
  enc: GPUCommandEncoder,
  label: string,
  view: GPUTextureView,
  timestampWrites?: GPURenderPassTimestampWrites,
  alpha = 0,
  loadOp: GPULoadOp = 'clear',
): GPURenderPassEncoder {
  return enc.beginRenderPass({
    label,
    colorAttachments: [
      { view, clearValue: { r: 0, g: 0, b: 0, a: alpha }, loadOp, storeOp: 'store' },
    ],
    ...(timestampWrites ? { timestampWrites } : {}),
  });
}
