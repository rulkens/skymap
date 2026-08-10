/**
 * encodeDustMapPass — the primary galaxy's dust slice splatted into
 * `dustMapTex` (`dustMap.wesl`, additive, four depth-sliced optical depths),
 * the map both dustAttenuation.wesl's componentEmission and the JWST view read.
 *
 * RETURNS the new value of the caller's "holds anything but zeros" latch, and
 * the caller MUST assign it — a skipped pass leaves whatever the last frame
 * wrote, so the latch is what makes skipping safe across a nonzero -> zero
 * transition (see `dustMapPopulated`'s declaration).
 */
import { beginClearPass } from '../passes/beginClearPass';

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
  /** Reassigned whenever `fieldCompsBuf` regrows, so it must be read fresh at the call site. */
  readonly bindGroup: GPUBindGroup;
  /** The primary's dust component count — zero still OPENS the pass, as the clear that empties the map. */
  readonly instanceCount: number;
}): boolean {
  const pass = beginClearPass(enc, 'galaxy:dustMapPass', targetView, timestampWrites);
  // The zero-count frame is a real case (the clearing frame above), and on it
  // the clear IS the pass: `beginClearPass`'s `loadOp: 'clear'` empties the map
  // whether or not a draw follows. Issuing the draw anyway rasterizes nothing
  // and Chrome flags it — "Draw with an instance count of 0 is unusual" —
  // because it is far more often a bug than a deliberate clear.
  if (instanceCount > 0) {
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, instanceCount);
  }
  pass.end();
  return instanceCount > 0;
}
