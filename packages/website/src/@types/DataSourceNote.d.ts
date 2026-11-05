/**
 * What a person adds to one source's generated page: nothing of the licence
 * record. `description` opens the page and is its row of the list; `facts`
 * are rows of data/facts.ts printed after `about`; `shows` is what it becomes
 * in the app; `scene` and `setting` are anchors on "What is in the scene" and
 * "All settings"; `view.to` follows the `#`; `figure` is a shot's id.
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
