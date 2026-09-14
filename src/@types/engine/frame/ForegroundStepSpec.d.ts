/**
 * ForegroundStepSpec — an authored `FRAME_ORDER` line for the near-field body
 * group, expanded over the frame's painter-ordered foreground chain. TWO rosters
 * because the chain interleaves the NEAR0 row (the star spheres) with the body
 * rows, and which roster a chain entry draws is the distinction the body-drawn
 * rows carry.
 */
export type ForegroundStepSpec = {
  readonly kind: 'foreground';
  readonly target: string;
  readonly near0Passes: readonly string[];
  readonly bodyPasses: readonly string[];
};
