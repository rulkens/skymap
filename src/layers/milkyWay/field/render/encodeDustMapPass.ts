/**
 * encodeDustMapPass — the primary galaxy's dust slice splatted into
 * `dustMapTex` (`dustMap.wesl`, additive, four depth-sliced optical depths),
 * the map both dustAttenuation.wesl's componentEmission and the JWST view read.
 *
 * Encoded on every frame the field encodes, dust or not: a skipped pass would
 * leave the last frame's dust in the map, and an empty clear of a reduced
 * target costs less than tracking whether it holds any.
 */
import { beginClearPass } from '../../../../services/gpu/lib/beginClearPass';

export function encodeDustMapPass({
  enc,
  timestampWrites,
  targetView,
  pipeline,
  bindGroup,
  instanceCount,
}: {
  readonly enc: GPUCommandEncoder;
  readonly timestampWrites?: GPURenderPassTimestampWrites;
  readonly targetView: GPUTextureView;
  readonly pipeline: GPURenderPipeline;
  /** The group `createFieldPipelines.sync` produced for THIS encode, against this frame's own resources. */
  readonly bindGroup: GPUBindGroup;
  /** The primary's dust component count — zero still clears. */
  readonly instanceCount: number;
}): void {
  const pass = beginClearPass(enc, 'galaxy:dustMapPass', targetView, timestampWrites);
  // Chrome warns on a zero-instance draw ("instance count of 0 is unusual"), so skip it.
  if (instanceCount > 0) {
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, instanceCount);
  }
  pass.end();
}
