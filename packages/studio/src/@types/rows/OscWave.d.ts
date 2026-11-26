/** An oscillation's sine as the evaluator plays it: `sin(2π (t − zeroSec) / periodSec)`, t in clip seconds. */
export type OscWave = {
  readonly periodSec: number;
  /** Where the sine crosses zero rising: the window's start, or 0 for a perpetual bob (absolute phase). */
  readonly zeroSec: number;
};
