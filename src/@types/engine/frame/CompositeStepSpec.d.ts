/**
 * CompositeStepSpec — an authored `FRAME_ORDER` line merging one whole target
 * OVER another in LINEAR space. `tonemap` is the sibling that carries the tone
 * curve, so the `tone: null` sentinel never appears in the authored artifact.
 */
export type CompositeStepSpec = {
  readonly kind: 'composite';
  readonly source: string;
  readonly dest: string;
};
