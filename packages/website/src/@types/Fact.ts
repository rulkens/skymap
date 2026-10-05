/** One published claim. `source` is where a reader verifies it; `evidence` is the repo path that backs our own number. */
export type Fact = {
  id: string;
  text: string;
  source: string;
  checked: string;
  evidence?: string;
};
