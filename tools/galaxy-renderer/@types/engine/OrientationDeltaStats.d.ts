/**
 * Accumulator shape `createOrientationDiagnostics.ts`'s `noteDelta` folds
 * in — formerly the out-param `rotateFrameToOrientation` (clusteredDiscPlacement.ts)
 * mutated in place during a CPU dust build; Task 16 deleted that CPU
 * sampler along with its own copy of this type, so it lives here now.
 * `createGalaxyModel.ts` reports an honest zeroed delta every rebuild since
 * Task 10 — placement is GPU-side and applies no such rotation on the CPU
 * to measure.
 */

export type OrientationDeltaStats = {
  count: number;
  sumAbsDeltaDeg: number;
  maxAbsDeltaDeg: number;
};
