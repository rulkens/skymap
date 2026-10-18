import type { AppVisibilityEntry } from './AppVisibilityEntry';

/** Every show entry's `key`: the bare address of something a Layer can show. */
export type ShowKey = Extract<AppVisibilityEntry, { readonly key: string }>['key'];
