/**
 * Search terms for the always-present Milky Way row, scored by `scoreFamousMatch` like any catalog row's
 * `names`; the first is what the row renders.
 */
const MILKY_WAY_PRIMARY_NAME = 'Milky Way';

// `as const` so `[0]` and `[0][0]` are `string` under `noUncheckedIndexedAccess`; the row view indexes them.
export const MILKY_WAY_NAMES = [MILKY_WAY_PRIMARY_NAME, 'Galaxy', 'Home'] as const;
