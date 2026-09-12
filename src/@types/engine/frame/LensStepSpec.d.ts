/**
 * LensStepSpec — an authored `FRAME_ORDER` line drawn once per body-slab row in
 * the frame's lensing list. Outside the fade band that list is empty and the
 * line expands to nothing: the black-hole lens's zero-dispatch guarantee.
 */
export type LensStepSpec = {
  readonly kind: 'lens';
  readonly target: string;
  readonly passes: readonly string[];
};
