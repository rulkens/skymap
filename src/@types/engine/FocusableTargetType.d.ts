import type { FocusableTarget } from './FocusableTarget';

// The tag every FocusableTarget dispatch table is keyed on. Derived from the
// union's own `type` discriminant rather than restated as a literal, so a new
// FocusableTarget arm widens this automatically and the Record<…> dispatch
// tables (detailCardTable, urlHashFor, targetIdentityKey) fail to compile until
// they grow the matching row — the drift can't go silent.
export type FocusableTargetType = FocusableTarget['type'];
