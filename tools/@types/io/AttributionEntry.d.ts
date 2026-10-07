/** One third-party entry of `ATTRIBUTIONS.md`, as `parseAttributions` reads it. */
export type AttributionEntry = {
  readonly id: string;
  /** The entry's `###` heading. */
  readonly title: string;
  /** The `##` heading it sits under. */
  readonly section: string;
  /** `rawDataRegistry` keys it covers: an exact key, or a prefix ending in `*`. */
  readonly keys: readonly string[];
  /** Outside hosts the app names at run time that belong to it. */
  readonly hosts: readonly string[];
  /** Bullet label → Markdown text, e.g. `fields.Licence`. */
  readonly fields: Readonly<Record<string, string>>;
  /** ISO date at the head of the `Checked` bullet; empty when the bullet is absent. */
  readonly checked: string;
  /** Every URL the `Checked` bullet lists as opened on that date. */
  readonly checkedUrls: readonly string[];
};
