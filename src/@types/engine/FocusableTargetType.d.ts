import type { SelectionKind } from './SelectionKind';

// Focusable kinds and selectable kinds are one set by design; every
// `Record<FocusableTargetType, …>` dispatch table grows a row per kind.
export type FocusableTargetType = SelectionKind;
