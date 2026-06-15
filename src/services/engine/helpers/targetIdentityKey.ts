/**
 * TARGET_IDENTITY_KEY — a stable, type-prefixed string identity per
 * FocusableTarget kind, keyed on the union tag `t.type`. Two targets name the
 * same thing iff their keys are equal; the type prefix makes cross-kind
 * comparisons unequal for free. Each row narrows `t` on `type` (no cast); the
 * empty-string fallback is unreachable because the table is only ever indexed
 * by the target's own tag.
 */
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import type { FocusableTargetType } from '../../../@types/engine/FocusableTargetType';

export const TARGET_IDENTITY_KEY: Record<FocusableTargetType, (t: FocusableTarget) => string> = {
  galaxyCatalog: (t) => (t.type === 'galaxyCatalog' ? `galaxyCatalog:${t.source}:${t.index}` : ''),
  structure: (t) => (t.type === 'structure' ? `structure:${t.id}` : ''),
  // The Milky Way is a singleton — its identity is the tag itself.
  milkyWay: () => 'milkyWay',
};
