import type { SelectionRefBase } from './SelectionRefBase';

/** What core knows of any InfoCard target: its kind, and the `ref` its kind's `toFocusable` stamped. */
export type FocusableTargetBase = { readonly type: string; readonly ref: SelectionRefBase };
