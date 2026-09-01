/**
 * createOrientationDiagnostics — the accumulator behind the readout in
 * `IsmMapSection`. `noteCoherence` folds in with each orientation READBACK
 * landing.
 *
 * `hasData`/`generation` are arguments to `report` rather than state here:
 * they are facts about the readback stream, which has its own home.
 */

import type { OrientationDiagnostics } from '../../../@types/engine/OrientationDiagnostics';

import { orientationCoherenceStats } from './orientationCoherenceStats';

export function createOrientationDiagnostics(): {
  /** Fold a landed orientation grid's coherence in. Packed `(cos2theta, sin2theta)` texels — see `orientationCoherenceStats`. */
  noteCoherence(texels: Float32Array): void;
  report(readback: {
    readonly hasData: boolean;
    readonly generation: number;
  }): OrientationDiagnostics;
} {
  let meanCoherence = 0;
  let maxCoherence = 0;

  return {
    noteCoherence(texels): void {
      const stats = orientationCoherenceStats(texels);
      meanCoherence = stats.mean;
      maxCoherence = stats.max;
    },

    report({ hasData, generation }): OrientationDiagnostics {
      return { hasData, generation, meanCoherence, maxCoherence };
    },
  };
}
