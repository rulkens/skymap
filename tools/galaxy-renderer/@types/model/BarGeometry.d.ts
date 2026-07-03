/**
 * BarGeometry — the precomputed shape of a barred galaxy's central bar:
 * its length plus the cos/sin of its fixed orientation angle. Precomputed
 * once per generation (not per star) since every bulge/bar star sample reads
 * the same two trig values — the classic hoist-out-of-the-hot-loop pattern
 * this codebase favours (see engine.ts's `apparentSizePx` gating).
 */

export type BarGeometry = {
  readonly barLength: number;
  readonly cosBar: number;
  readonly sinBar: number;
};
