/**
 * Accumulator shape `createOrientationDiagnostics.ts`'s `noteDelta` folds
 * in. `createGalaxyModel.ts` reports an honest zeroed delta every rebuild:
 * placement is GPU-side and applies no such rotation on the CPU to measure.
 */

export type OrientationDeltaStats = {
  count: number;
  sumAbsDeltaDeg: number;
  maxAbsDeltaDeg: number;
};
