/**
 * One seq step with a duration, plus the zero-length children written before it
 * (the first span also takes leading ones; trailing ones get a span of their own,
 * last). `[lo, hi)` index ranges into the compile accumulator arrays in PUSH
 * order, which is tree order, not time order.
 */
export type StepSpan = {
  readonly segs: readonly [number, number];
  readonly composites: readonly [number, number];
  readonly steps: readonly [number, number];
};
