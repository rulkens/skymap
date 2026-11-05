import type { AppVisibilityEntry } from './AppVisibilityEntry';
import type { LabelName } from './LabelName';

/** The item ids of label entry `L`; `never` for an entry without items. */
export type LabelItemOf<L extends LabelName> = Extract<
  AppVisibilityEntry,
  { readonly label: L; readonly items: readonly string[] }
>['items'][number];
