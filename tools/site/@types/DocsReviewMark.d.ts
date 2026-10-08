/** One passage of a docs page that the cutter proposes to change, and the owner's ruling on it. */
export type DocsReviewMark = {
  /** Short, unique within its file. */
  id: string;
  /** The passage as it reads on the rendered page: plain text, no markdown. */
  text: string;
  /** The cutter's one-line reason; `owner` for a mark the owner drew. */
  reason: string;
  state: 'cut' | 'keep' | 'rewrite' | 'good';
  /** Why the owner calls a `good` passage good; kept when the mark leaves `good`. */
  why?: string;
  /** The owner's replacement wording for a `rewrite` mark; kept when the mark leaves `rewrite`. */
  after?: string;
  /** The owner's instruction for the rewrite ("shorter; say where the switch is"); kept like `after`. */
  how?: string;
};
