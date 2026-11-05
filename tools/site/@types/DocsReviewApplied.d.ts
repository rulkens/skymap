/** One carried-out apply: the commit that holds the edit, and the marks it carried out. */
export type DocsReviewApplied = {
  commit: string;
  /** ISO time of the edit. */
  at: string;
  markIds: string[];
};
