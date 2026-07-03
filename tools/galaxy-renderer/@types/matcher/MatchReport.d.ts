/**
 * MatchReport — the per-metric reference-vs-rendered comparison the fit
 * scorer emits: arm count, pitch angle (q), and dust coverage, each as a
 * (reference, rendered) pair so the compare panel can show both numbers
 * side by side rather than just a collapsed score.
 */

export type MatchReport = {
  readonly armsRef: number;
  readonly armsRen: number;
  readonly qRef: number;
  readonly qRen: number;
  readonly dustRef: number;
  readonly dustRen: number;
};
