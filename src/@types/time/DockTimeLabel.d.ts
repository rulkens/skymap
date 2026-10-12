/** What the phone dock's Time item shows: a word, or a date plus a run-state glyph. */
export type DockTimeLabel = {
  readonly text: string;
  /** Run-state glyph (playing / paused) when the clock is off real time; null on running real time. */
  readonly glyph: '▶' | '❚❚' | null;
  /** Accessible name: the visible text drops the year, this keeps it and spells out the run state. */
  readonly name: string;
};
