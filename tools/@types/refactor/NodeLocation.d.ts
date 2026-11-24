/** The span of one name token: an identifier or the inside of a string-literal key. */
export type NodeLocation = {
  readonly file: string; // absolute path, real case
  readonly start: number; // UTF-16 offset
  readonly end: number;
};
