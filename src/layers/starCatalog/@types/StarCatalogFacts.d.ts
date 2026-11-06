/**
 * What the Layer publishes into `state.engine.starCatalog`: the Debug panel's
 * chunk-pool resize outcome. The famous-star sidecar is no fact; the selection
 * row joins it onto the row (`StarCatalogSelectionRow.famous`).
 */

export type StarCatalogFacts = {
  /** Why the last chunk-pool resize failed (names the largest count that fits); null once one succeeds. */
  readonly chunkSlotsError: string | null;
};
