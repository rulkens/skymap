import type { SelectionKind } from './SelectionKind';

// Focusable kinds and selectable kinds are one set by design — derived from
// `SelectionKind` (itself from `SELECTION_KINDS`) rather than the union's own
// `type` discriminant, so a new `FocusableTarget` arm widens `SelectionKind`
// and the Record<…> dispatch tables (detailCardTable, urlHashFor,
// targetIdentityKey) fail to compile until they grow the matching row — the
// drift can't go silent.
export type FocusableTargetType = SelectionKind;
