import type { TitleLine } from './TitleLine';

/** A title line laid out: em size and condensing in px terms, top edge relative to the interior's centre. */
export type PlacedTitleLine = {
  readonly line: TitleLine;
  readonly em: number;
  readonly squeeze: number;
  readonly top: number;
};
