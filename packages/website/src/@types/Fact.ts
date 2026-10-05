/**
 * One published claim. `source` is where a reader verifies it; `evidence` is
 * the repo path or calculation that backs our own number; `short` is the form
 * the page prints (a distance, or a caption sentence), so wording lives here
 * beside its source and pages only render by id.
 */
export type Fact = {
  id: string;
  text: string;
  source: string;
  checked: string;
  evidence?: string;
  short?: string;
};
