/**
 * Similarity2D — q ≈ scale·R(theta)·M·p + t, R(θ) = [[cos θ, −sin θ], [sin θ, cos θ]]
 * and M flipping x when `mirrored`: the least-squares fit `fitSimilarity2D` returns.
 */
import type { Vec2 } from './Vec2';

export type Similarity2D = {
  readonly scale: number;
  readonly theta: number;
  readonly mirrored: boolean;
  readonly t: Vec2;
  /** Root-mean-square miss over the fitted points, in q's units. */
  readonly rms: number;
};
