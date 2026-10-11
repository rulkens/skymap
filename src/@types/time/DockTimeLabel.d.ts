/** What the phone dock's Time item shows: a word, or a date plus a run-state glyph. */
export type DockTimeLabel = {
  readonly text: string;
  /** Run-state glyph (playing / paused) when the clock is off real time; null on real time. */
  readonly glyph: '▶' | '❚❚' | null;
};
