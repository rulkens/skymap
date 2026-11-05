/** One jscpd exact-token clone: file `a` from line `la` duplicates file `b` from line `lb`. */
export type Clone = {
  readonly a: string;
  readonly la: number;
  readonly b: string;
  readonly lb: number;
  /** Length of the duplicated span, in source lines and in jscpd tokens. */
  readonly lines: number;
  readonly tokens: number;
  readonly areaA: string;
  readonly areaB: string;
  /** First three non-blank lines of the span, trimmed and joined, capped at 160 chars: the row's preview. */
  readonly sample: string;
};
