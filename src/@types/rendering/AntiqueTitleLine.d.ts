/** One line of a cartouche title: IM Fell face, cap height relative to the first line, tracking in em. */
export type AntiqueTitleLine = {
  readonly text: string;
  readonly face: 'roman' | 'italic';
  readonly cap: number;
  readonly tracking: number;
  /** Narrowest condensing allowed before the whole block shrinks instead. */
  readonly minSqueeze: number;
};
