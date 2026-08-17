/**
 * createOrientationDiagnostics — the accumulator behind the readout in
 * `IsmMapSection`. Two producers write it and neither can wait for the other:
 * coherence lands with an orientation READBACK, the delta pair with a dust
 * REBUILD, and either may be the newer half at any report.
 *
 * `hasData`/`generation` are arguments to `report` rather than state here:
 * they are facts about the readback stream, which has its own home.
 */

import type { OrientationDeltaStats } from '../../../@types/engine/OrientationDeltaStats';
import type { OrientationDiagnostics } from '../../../@types/engine/OrientationDiagnostics';

import { orientationCoherenceStats } from './orientationCoherenceStats';

export function createOrientationDiagnostics(): {
  /** Fold a landed orientation grid's coherence in. Packed `(cos2theta, sin2theta)` texels — see `orientationCoherenceStats`. */
  noteCoherence(texels: Float32Array): void;
  /** Fold one dust build's `rotateFrameToOrientation` accumulator in. */
  noteDelta(stats: OrientationDeltaStats): void;
  report(readback: {
    readonly hasData: boolean;
    readonly generation: number;
  }): OrientationDiagnostics;
} {
  let meanCoherence = 0;
  let maxCoherence = 0;
  let meanDeltaDeg = 0;
  let maxDeltaDeg = 0;

  return {
    noteCoherence(texels): void {
      const stats = orientationCoherenceStats(texels);
      meanCoherence = stats.mean;
      maxCoherence = stats.max;
    },

    noteDelta(stats): void {
      // A build that placed nothing (dust off, or no geometry yet) reports a
      // zero count; 0 is the honest mean there, not a division.
      meanDeltaDeg = stats.count > 0 ? stats.sumAbsDeltaDeg / stats.count : 0;
      maxDeltaDeg = stats.maxAbsDeltaDeg;
    },

    report({ hasData, generation }): OrientationDiagnostics {
      return { hasData, generation, meanCoherence, maxCoherence, meanDeltaDeg, maxDeltaDeg };
    },
  };
}
