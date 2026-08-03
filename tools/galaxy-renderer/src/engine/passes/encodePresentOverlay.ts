/**
 * encodePresentOverlay — one additive diagnostic overlay drawn straight into
 * the already-open HDR scene pass at full canvas resolution: no offscreen and
 * no upsample, because these are read as data rather than as glow.
 *
 * Without `instances` the draw is a covering triangle; with them it is one
 * camera-facing quad per record, that buffer at vertex slot 0. Buffer and count
 * travel as one value so neither can arrive without the other.
 */
import type { InstanceDraw } from '../../../@types/engine/InstanceDraw';

export function encodePresentOverlay(
  pass: GPURenderPassEncoder,
  pipeline: GPURenderPipeline,
  bindGroup: GPUBindGroup,
  instances?: InstanceDraw,
): void {
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  if (!instances) {
    pass.draw(3);
    return;
  }
  pass.setVertexBuffer(0, instances.buf);
  pass.draw(6, instances.count);
}
