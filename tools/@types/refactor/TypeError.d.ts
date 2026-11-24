/** One semantic error the engine's projects report. */
export type TypeError = {
  readonly file: string; // absolute, real case
  readonly line: number; // 1-based
  readonly column: number;
  readonly message: string; // first line of the diagnostic, with its TS code
};
