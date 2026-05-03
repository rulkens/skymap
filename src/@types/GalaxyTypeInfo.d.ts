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
  /**
   * Coarse classification — for UI tinting.
   *
   * - `'red'` / `'blue'`: red-sequence vs blue-cloud (Strateva et al. 2001
   *   bimodality, applicable to optical colour indices like u−r and B−J).
   * - `'green'`: intermediate / "green valley" galaxies — added so per-source
   *   classifiers (B−J, J−K) can express a middle bin without forcing
   *   borderline rows into the wrong sequence.
   * - `'unknown'`: photometry missing or flagged.
   */
  category: 'red' | 'green' | 'blue' | 'unknown';
  /** Human-readable description, e.g. "Red, quiescent galaxy". */
  description: string;
};
