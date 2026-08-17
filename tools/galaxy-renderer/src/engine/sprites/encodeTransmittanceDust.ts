/**
 * encodeTransmittanceDust — the dust billboards (`dust.wesl`, multiplicative
 * transmittance) into the already-open HDR scene pass: central galaxy first,
 * then every extra, each record buffer at vertex slot 1 over the shared quad at
 * slot 0.
 *
 * Full-res on the real accumulation rather than on the aggregate, and encoded
 * AFTER the composites above it: a transmittance multiply has to land on the
 * starlight it silhouettes.
 */
import type { InstanceDraw } from '../../../@types/engine/InstanceDraw';

export function encodeTransmittanceDust(
  pass: GPURenderPassEncoder,
  pipeline: GPURenderPipeline,
  bindGroup: GPUBindGroup,
  quad: GPUBuffer,
  instances: readonly InstanceDraw[],
): void {
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.setVertexBuffer(0, quad);
  for (const instance of instances) {
    pass.setVertexBuffer(1, instance.buf);
    pass.draw(6, instance.count);
  }
}
