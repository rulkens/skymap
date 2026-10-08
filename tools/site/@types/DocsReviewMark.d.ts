/** One passage of a docs page that the cutter proposes to change, and the owner's ruling on it. */
export type DocsReviewMark = {
  /** Short, unique within its file. */
  id: string;
  /** The passage as it reads on the rendered page: plain text, no markdown. */
  text: string;
  /** The cutter's one-line reason; `owner` for a mark the owner drew. */
  reason: string;
  state: 'cut' | 'keep' | 'rewrite';
};
