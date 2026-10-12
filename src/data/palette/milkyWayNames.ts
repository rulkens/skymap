/**
 * Fixed search terms for the always-present Milky Way row.  The matcher
 * (`scoreFamousMatch`) scores these like any catalog row's `names`, so
 * "milky way", "galaxy", or "home" all surface the command.  The first is
 * what renders in the row.
 */
const MILKY_WAY_PRIMARY_NAME = 'Milky Way';

// `as const` (readonly tuple, not `readonly string[]`) so `MILKY_WAY_NAMES[0]`
// and `[0][0]` are `string` under `noUncheckedIndexedAccess` — the row view
// indexes them directly.
export const MILKY_WAY_NAMES = [MILKY_WAY_PRIMARY_NAME, 'Galaxy', 'Home'] as const;