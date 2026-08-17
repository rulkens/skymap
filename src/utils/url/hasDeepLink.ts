/**
 * hasDeepLink — does the URL express specific user intent that should
 * suppress the splash on first arrival?
 *
 * ### Rationale
 *
 * The splash UX (per the 2026-05-20 grill) treats deep-link arrivals as
 * "this user already knows what they want — get out of their way".  Two
 * kinds of URL content qualify:
 *
 *   - a hash param whose row in `HASH_PARAM_SOURCES` is marked
 *     `deepLink: true` — today that is `#focus=<id>` (pin a specific galaxy,
 *     structure, or body) and `#t=<instant>` (a shared link carrying a
 *     specific sim moment). `#orientation=<frame>` is present in the same
 *     table but `deepLink: false`: a pole preference is a view setting, not
 *     intent worth skipping the introduction for.
 *   - `?tour=<name>` — request the tour at a specific anchor.
 *
 * Dev/power-user query gates (`?gpuTimings`, `?impostor`, …) don't qualify —
 * they change developer surfaces, not what the visitor is looking at.
 * Bundling them into the deep-link predicate would suppress the splash for
 * every contributor running with a gate on, which is the opposite of useful.
 *
 * ### Why the hash keys are derived, not hard-coded here
 *
 * `HASH_PARAM_SOURCES` is the single table that owns every hash param —
 * `hashBodyFor`, the read/write sagas, and this predicate all walk it rather
 * than each keeping their own key list. Reading `deepLink` off the row means
 * adding a new deep-linkable param is one row in that table; a second,
 * hand-maintained list of "which keys suppress the splash" living here is
 * exactly the kind of place a new row is added and this file is forgotten —
 * the table would say `deepLink: true` and the splash would still show.
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
import { HASH_PARAM_SOURCES } from '../../state/url/hashParamSources';
import { parseHashParams } from './parseHashParams';

const DEEP_LINK_QUERY_KEYS = new Set(['tour']);

const DEEP_LINK_HASH_KEYS = new Set(
  HASH_PARAM_SOURCES.filter((source) => source.deepLink).map((source) => source.key),
);

export function hasDeepLink({ hash, search }: DeepLinkInput): boolean {
  // Hash: parse into key→value pairs and check each present key against the
  // table's deep-link rows. (The hash always starts with `#` if present, so
  // stripping one leading character is safe either way.)
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = parseHashParams(body);
  for (const key of params.keys()) {
    if (DEEP_LINK_HASH_KEYS.has(key)) return true;
  }

  // Search: parse and look for known deep-link keys.  We strip a leading
  // `?` so callers can pass either `?tour=foo` or `tour=foo`.
  const normalized = search.startsWith('?') ? search.slice(1) : search;
  if (normalized.length === 0) return false;
  const searchParams = new URLSearchParams(normalized);
  for (const key of searchParams.keys()) {
    if (DEEP_LINK_QUERY_KEYS.has(key)) return true;
  }
  return false;
}
