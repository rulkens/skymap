/**
 * BarycentricPair — a primary whose element row describes the pair's barycentre,
 * not the primary itself: `deriveBodyStates` subtracts the secondary's reflex,
 * `secondaryMassFraction` × the secondary's primary-relative offset.
 */

export type BarycentricPair = {
  readonly primaryId: string;
  readonly secondaryId: string;
  /** The secondary's share of the pair mass, m₂ / (m₁ + m₂). */
  readonly secondaryMassFraction: number;
};
