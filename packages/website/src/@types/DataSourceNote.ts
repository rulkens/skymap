/**
 * What a person adds to one source's generated page, by entry id: nothing of
 * the licence record. `title` replaces the rule-made title where the rule
 * cuts a heading badly; `description` is one sentence on what the source is,
 * the page's opening line and its row of the list. `about` is a paragraph on
 * a major source and `facts` the sourced rows of data/facts.ts after it.
 * `shows` says what it becomes in the app; `scene` and `setting` are anchors
 * on "What is in the scene" and "All settings"; `view` opens the app on it
 * (`to` follows the `#`); `figure` is a shot of data/siteShots.ts that shows it.
 */
export type DataSourceNote = {
  readonly title?: string;
  readonly description?: string;
  readonly about?: string;
  readonly facts?: readonly string[];
  readonly shows?: string;
  readonly scene?: string;
  readonly setting?: string;
  readonly view?: { readonly to: string; readonly label: string };
  readonly figure?: string;
};
