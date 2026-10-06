/**
 * One published claim. `source` is where a reader verifies it and `sourceLabel`
 * is what its link says; `short` is the form the page prints (a distance, or a
 * caption sentence), so wording lives here beside its source and pages only
 * render by id. `about: 'app'` marks a statement about the app or the project
 * rather than the universe; absent means a science or representation claim, and
 * only those are listed in a page's Sources.
 */
export type Fact = {
  id: string;
  text: string;
  source: string;
  sourceLabel: string;
  checked: string;
  short?: string;
  about?: 'app';
};
