/**
 * What a person adds to one source's generated page, by entry id: nothing of
 * the licence record. `title` replaces the rule-made page title where the
 * rule cuts a heading badly. `about` is one plain paragraph on what the
 * source is, and `facts` the sourced rows of data/facts.ts printed after it.
 * `shows` says what the source becomes in the app; `scene` and `setting` are
 * anchors on "What is in the scene" and "All settings"; `view` is a link that
 * opens the app on it (`to` is what follows the `#`), and `figure` a picture
 * of data/siteShots.ts that shows it, which carries a link of its own.
 */
export type DataSourceNote = {
  readonly title?: string;
  readonly about?: string;
  readonly facts?: readonly string[];
  readonly shows?: string;
  readonly scene?: string;
  readonly setting?: string;
  readonly view?: { readonly to: string; readonly label: string };
  readonly figure?: string;
};
