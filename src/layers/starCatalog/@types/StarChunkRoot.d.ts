/** One root of a landing chunk: its key, which its top rows' parent keys match, and its index row. */
export type StarChunkRoot = {
  readonly level: number;
  readonly morton: number;
  readonly rootRow: number;
};
