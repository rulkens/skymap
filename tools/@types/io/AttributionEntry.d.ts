import type { AttributionUse } from './AttributionUse';

/** One third-party entry of `ATTRIBUTIONS.md`, as `parseAttributions` reads it. */
export type AttributionEntry = {
  readonly id: string;
  /** `rawDataRegistry` keys it covers: an exact key, or a prefix ending in `*`. */
  readonly keys: readonly string[];
  /** Outside hosts the app's source names that belong to it. */
  readonly hosts: readonly string[];
  /** The terms of the `Use` bullet, each one of the closed vocabulary; empty when the bullet is absent. */
  readonly use: readonly AttributionUse[];
  /** Bullet label → Markdown text, e.g. `fields.Licence`. */
  readonly fields: Readonly<Record<string, string>>;
  /** ISO date at the head of the `Checked` bullet; empty when the bullet is absent. */
  readonly checked: string;
};
