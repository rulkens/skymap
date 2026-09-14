/**
 * CaptureStepSpec — an authored `FRAME_ORDER` line re-drawing part of the sky
 * into a cube-face target. TWO rosters because the captured content spans both
 * slabs and a render step is the unit of pass encoding: one roster alone leaves
 * the other slab's half permanently unreachable.
 */
export type CaptureStepSpec = {
  readonly kind: 'capture';
  readonly target: string;
  readonly cosmoPasses: readonly string[];
  readonly near0Passes: readonly string[];
};
