import type { AntiqueTitleLine } from './AntiqueTitleLine';

/** A title line laid out: em size and condensing in px, ink-box top relative to the interior's centre. */
export type AntiquePlacedTitleLine = {
  readonly line: AntiqueTitleLine;
  readonly em: number;
  readonly squeeze: number;
  readonly top: number;
};
