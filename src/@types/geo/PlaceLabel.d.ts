/** What a standing spot is called; `near` when `text` names a place rather than coordinates. */
export type PlaceLabel = {
  readonly text: string;
  readonly near: boolean;
};
