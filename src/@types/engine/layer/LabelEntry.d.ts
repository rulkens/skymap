import type { VisibilityEntryCommon } from './VisibilityEntryCommon';

/** Something a Layer can label: addressed by `label:<label>`, switched by `labelEnabled`. */
export type LabelEntry = VisibilityEntryCommon & {
  readonly label: string;
  readonly cluster: string;
  /** The show key it labels: its target also requires that entry's target, item for item.
   * `string`, not `ShowKey`, because that union derives from the entries (circular);
   * `appVisibility.ts` checks every `of` against it instead. */
  readonly of?: string;
};
