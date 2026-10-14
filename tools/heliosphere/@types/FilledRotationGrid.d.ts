/**
 * FilledRotationGrid — a rotation's 72 longitude columns after gap-filling, plus which
 * fallbacks supplied columns so the build can report its patches.
 */

export type FilledRotationGrid = {
  readonly grid: number[][];
  readonly usedClassicModel: boolean;
  readonly usedPreviousRotation: boolean;
};
