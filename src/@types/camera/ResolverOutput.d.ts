/**
 * ResolverOutput — the return value of `resolveFocusTarget`.
 *
 * Three shapes:
 *
 *   - `resolved: true`   — found a cloud row matching the target.
 *   - `reason: 'tier'`   — the target *probably* names a real galaxy,
 *                          but it's not in the user's currently-loaded
 *                          tier/source.  UI: render a banner with
 *                          "load a larger tier or enable SDSS".
 *   - `reason: 'unknown'` — we have no evidence this target ever existed.
 *                          UI: silently clear the hash and move on.
 *
 * The tier-vs-unknown distinction matters because deep links land on
 * cold tabs.  A shared `#focus=pgc-12345` from a friend on a powerful
 * machine might miss the recipient's small-tier default; we want them
 * to see "expand your data" rather than "this galaxy doesn't exist".
 */

import type { SourceType } from '../data/SourceType';

export type ResolverOutput =
  | { resolved: true; source: SourceType; localIdx: number }
  | { resolved: false; reason: 'tier' | 'unknown' };
