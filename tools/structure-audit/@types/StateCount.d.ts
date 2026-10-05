/** `n` state hits in one file; `code` (non-comment lines) is set so closure cells can be read per line of code. */
export type StateCount = {
  readonly f: string;
  readonly area: string;
  readonly n: number;
  readonly code?: number;
};
