/** How many marks are in each state, and how many feedback notes sit beside them. */
export type ReviewCounts = {
  cut: number;
  keep: number;
  rewrite: number;
  good: number;
  notes: number;
};
