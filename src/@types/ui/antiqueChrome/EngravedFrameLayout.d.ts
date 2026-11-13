/**
 * EngravedFrameLayout — where an engraved frame's parts land, in CSS px from the
 * outer edge. `rules` are [centre offset, stroke width] pairs; `border` is the
 * depth the rules occupy; `slice` is the 9-slice corner size; `tile` is one
 * ink-and-paper chequer pair, the unit `border-image-repeat: round` lays along
 * an edge. The ladder's phase is anchored so an edge starts on an ink cell at
 * `slice`.
 */
export type EngravedFrameLayout = {
  readonly rules: readonly (readonly [number, number])[];
  readonly bandAt: number;
  readonly band: number;
  readonly cell: number;
  readonly border: number;
  readonly slice: number;
  readonly tile: number;
};
