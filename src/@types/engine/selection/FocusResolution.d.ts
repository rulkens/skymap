import type { SelectionRefBase } from './SelectionRefBase';

/**
 * A focus id's answer. `pending` means the data that would decide has not
 * committed yet, so a caller waits; `absent` means nothing holds the id, so a
 * caller gives up. Only the claiming Layer row can tell the two apart.
 */
export type FocusResolution<Ref extends SelectionRefBase = SelectionRefBase> =
  | { readonly kind: 'pending' }
  | { readonly kind: 'absent' }
  | { readonly kind: 'hit'; readonly ref: Ref };
