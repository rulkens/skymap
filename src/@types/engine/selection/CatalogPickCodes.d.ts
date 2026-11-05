/**
 * A Layer's catalog ↔ pick-code map, asked of `LayerCoreDeps.pickCode` once per
 * catalog. Every stamp site and the selection row read it, so a pick word never
 * carries a catalog `Source` value.
 */
export type CatalogPickCodes<S extends number> = {
  pickCodeOf(source: S): number;
  /** Null for a code another Layer owns. */
  catalogOfPickCode(code: number): S | null;
};
