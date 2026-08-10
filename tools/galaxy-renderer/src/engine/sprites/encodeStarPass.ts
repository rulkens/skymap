/**
 * encodeStarPass — the additive sprite cloud (`stars.wesl`) into the
 * reduced-resolution aggregate, central galaxy first then every extra. Cleared
 * to a=0: the scene pass's additive composite reads an untouched texel as "no
 * light", and an opaque clear would inject a full alpha into that sum.
 *
 * An EMPTY `instances` list is the sprite half switched off, and the pass then
 * issues nothing but its clear — "sprites off" has to mean "sprite cost off"
 * for the two representations of the cloud to be comparable on the clock.
 */
import type { InstanceDraw } from '../../../@types/engine/InstanceDraw';

import { beginClearPass } from '../passes/beginClearPass';

export function encodeStarPass({
  enc,
  timestampWrites,
  targetView,
  pipeline,
  bindGroup,
  quad,
  instances,
}: {
  readonly enc: GPUCommandEncoder;
  readonly timestampWrites?: GPURenderPassTimestampWrites;
  readonly targetView: GPUTextureView;
  readonly pipeline: GPURenderPipeline;
  readonly bindGroup: GPUBindGroup;
  /** The shared unit quad, vertex slot 0; every instance list entry rides slot 1. */
  readonly quad: GPUBuffer;
  readonly instances: readonly InstanceDraw[];
}): void {
  const pass = beginClearPass(enc, 'galaxy:starPass', targetView, timestampWrites);
  if (instances.length > 0) {
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, quad);
    for (const instance of instances) {
      pass.setVertexBuffer(1, instance.buf);
      pass.draw(6, instance.count);
    }
  }
  pass.end();
}
