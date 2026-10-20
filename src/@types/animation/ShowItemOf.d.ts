import type { AppVisibilityEntry } from './AppVisibilityEntry';
import type { ShowKey } from './ShowKey';

/** The item ids of show entry `K`; `never` for an entry without items. */
export type ShowItemOf<K extends ShowKey> = Extract<
  AppVisibilityEntry,
  { readonly key: K; readonly items: readonly string[] }
>['items'][number];
