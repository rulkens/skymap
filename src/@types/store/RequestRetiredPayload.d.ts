import type { SelectionState } from './SelectionState';

/** The request slot whose pending id ends without a ref write. */
export type RequestRetiredPayload = { readonly slot: keyof SelectionState['pending'] };
