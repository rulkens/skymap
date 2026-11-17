/**
 * EngravedEdgeTile — one repeat of an engraved frame's top edge, from
 * `engravedEdgeSvg`: `tile` wide (one ink-and-paper ladder pair) and `height`
 * deep (the frame's border), both CSS px.
 */
export type EngravedEdgeTile = {
  readonly svg: string;
  readonly tile: number;
  readonly height: number;
};
