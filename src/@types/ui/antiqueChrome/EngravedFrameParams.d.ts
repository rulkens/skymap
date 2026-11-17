/**
 * EngravedFrameParams — the geometry of an engraved compartment frame, in CSS px:
 * a heavy outer rule, a paper gap, then a chequered degree ladder between two
 * hairlines (Blaeu and de Wit neatlines). `ornament` is the corner piece's box;
 * 0 leaves the corners plain. Read by `engravedFrameLayout`.
 */
export type EngravedFrameParams = {
  readonly outer: number;
  readonly hair: number;
  readonly gap: number;
  readonly band: number;
  readonly cell: number;
  readonly ornament: number;
};
