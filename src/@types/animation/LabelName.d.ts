import type { AppVisibilityEntry } from './AppVisibilityEntry';

/** Every label entry's `label`; a label row names its entry by it. */
export type LabelName = Extract<AppVisibilityEntry, { readonly label: string }>['label'];
