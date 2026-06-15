/**
 * hasDeepLink — does the URL express specific user intent that should
 * suppress the splash on first arrival?
 *
 * ### Rationale
 *
 * The splash UX (per the 2026-05-20 grill) treats deep-link arrivals as
 * "this user already knows what they want — get out of their way".  Two
 * URL shapes qualify:
 *
 *   - `#focus=<id>` — pin a specific galaxy or structure (set by the
 *     InfoCard deep-link drain in useUrlSync; structures ride the same
 *     prefix as galaxies).
 *   - `?tour=<name>` — request the tour at a specific anchor.
 *
 * Power-user gates (`?debug`, `?volumes`, `?anchors`, `?gpuTimings`)
 * don't qualify — they change developer surfaces, not what the visitor
 * is looking at.  Bundling them into the deep-link predicate would
 * suppress the splash for every contributor running with `?debug` on,
 * which is the opposite of useful.
 *
 * ### Pure
 *
 * Takes hash + search as plain strings; the caller decides where to read
 * them from (typically `window.location.hash` / `window.location.search`,
 * but the splash hook also feeds in fixtures in tests).  No `typeof
 * window` guard needed here — that's the caller's job.
 *
 * ### Search-string normalisation
 *
 * `window.location.search` includes the leading `?`; query strings passed
 * by tests sometimes don't.  We normalise by stripping a leading `?` and
 * then parsing with `URLSearchParams` so callers can be sloppy about the
 * leading character.
 */

import type { DeepLinkInput } from '../../@types/splash/DeepLinkInput';

const DEEP_LINK_QUERY_KEYS = new Set(['tour']);

export function hasDeepLink({ hash, search }: DeepLinkInput): boolean {
  // Hash: look for the #focus= prefix anywhere in the body.
  // (The hash always starts with `#` if present, so a prefix check is safe.)
  // Both galaxies and structures share this prefix.
  if (hash.includes('#focus=') || hash.startsWith('#focus=')) return true;

  // Search: parse and look for known deep-link keys.  We strip a leading
  // `?` so callers can pass either `?tour=foo` or `tour=foo`.
  const normalized = search.startsWith('?') ? search.slice(1) : search;
  if (normalized.length === 0) return false;
  const params = new URLSearchParams(normalized);
  for (const key of params.keys()) {
    if (DEEP_LINK_QUERY_KEYS.has(key)) return true;
  }
  return false;
}
