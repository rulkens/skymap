/** One root of a landing chunk: its key, which its top rows' parent keys match, and its pool row (in the index or its parent's slot). */
export type StarChunkRoot = {
  readonly level: number;
  readonly morton: number;
  readonly rootRow: number;
};
