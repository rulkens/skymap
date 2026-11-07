/** One line of the cartouche title: cap height relative to the first line, tracking in em. */
export type TitleLine = {
  readonly text: string;
  readonly file: string;
  readonly cap: number;
  readonly tracking: number;
  readonly minSqueeze: number;
};
