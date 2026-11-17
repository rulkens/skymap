/** A path string found in a file; the span excludes the quotes. */
export type PathReference = {
  readonly start: number;
  readonly end: number;
  readonly value: string;
};
