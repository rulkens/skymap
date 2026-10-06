/**
 * One published claim. `source` is where a reader verifies it and `sourceLabel`
 * is what its link says; `short` is the form the page prints (a distance, or a
 * caption sentence), so wording lives here beside its source and pages only
 * render by id.
 */
export type Fact = {
  id: string;
  text: string;
  source: string;
  sourceLabel: string;
  checked: string;
  short?: string;
};
