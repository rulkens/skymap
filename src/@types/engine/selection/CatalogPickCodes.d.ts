/**
 * A Layer's catalog ↔ pick-code map, asked of `LayerCoreDeps.pickCode` once per
 * catalog (or, for the structure Layer, per category). Every stamp site and the selection row read it, so a pick word never
 * carries a catalog id.
 */
export type CatalogPickCodes<K extends string> = {
  pickCodeOf(key: K): number;
  /** Null for a code another Layer owns. */
  catalogOfPickCode(code: number): K | null;
};
