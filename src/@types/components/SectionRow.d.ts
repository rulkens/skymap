/**
 * SectionRow — one labelled checkbox in a SettingsPanel section.
 *
 * The section renders rows and derives its master tri-state from them; it does
 * not know which settings cluster any row came from. That knowledge lives in
 * the container, which is the only place that can hold it without dragging
 * store imports into a presentational component. `id` is the checkbox element
 * id (and the label's `htmlFor`).
 */
export type SectionRow = {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly onChange: (enabled: boolean) => void;
};
