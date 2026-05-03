/**
 * GalaxyTypeInfo — coarse classification of a galaxy based on its u−r colour
 * index. Used by the info card for tinting and human-readable descriptions.
 */

/**
 * Coarse galaxy classification inferred from the u−r colour index.
 *
 * `category` is intended for UI tinting; `description` is human-readable
 * text suitable for display in an info card.
 */
export type GalaxyTypeInfo = {
  /** Coarse classification — for UI tinting. */
  category: 'red' | 'blue' | 'unknown';
  /** Human-readable description, e.g. "Red, quiescent galaxy". */
  description: string;
};
