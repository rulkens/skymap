/**
 * BarycentricPair — set on a primary's orbit row whose elements describe the pair's
 * barycentre, not the primary itself: the placement subtracts the secondary's reflex,
 * `secondaryMassFraction` × the secondary's primary-relative offset.
 */

import type { SceneBodyId } from './SceneBodyId';

export type BarycentricPair = {
  readonly secondaryId: SceneBodyId;
  /** The secondary's share of the pair mass, m₂ / (m₁ + m₂). */
  readonly secondaryMassFraction: number;
};
