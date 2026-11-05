/** The owner's request to carry the review out; the agent that watches the file does the edit and removes this. */
export type DocsReviewApply = {
  /** `page`, or the text of one section heading. */
  scope: 'page' | string;
  /** ISO time of the confirm. */
  requested: string;
};
